import type { IncomingMessage, Server } from 'http'
import type WebSocket from 'ws'
import { v4 as uuid } from 'uuid'
import log from 'electron-log'
import { isHexString } from '@ethereumjs/util'

import { parseOrigin, parseRequestChainId, type FrameExtension, type OriginsService } from './origins.js'
import validPayload from './validPayload.js'
import protectedMethods from './protectedMethods.js'
import { createRpcPrincipal, type TrustedPrincipal } from '../authority.js'
import type { ApiTimerPort } from './http.js'

interface Subscription {
  originId: string
  socket: FrameWebSocket
}

interface FrameWebSocket extends WebSocket {
  id: string
  origin?: string
  frameExtension?: FrameExtension
  companionInternal: boolean
}

interface ExtensionPayload extends JSONRPCRequestPayload {
  __frameOrigin?: string
  __extensionConnecting?: boolean
}

export interface WebSocketProviderPort {
  send(
    payload: RPCRequestPayload,
    respond?: (response: RPCResponsePayload) => void,
    principal?: TrustedPrincipal
  ): void
  on(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
  off(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
}

export interface WebSocketServerPort {
  on(event: 'connection', listener: (socket: FrameWebSocket, req: IncomingMessage) => void): unknown
  off(event: 'connection', listener: (socket: FrameWebSocket, req: IncomingMessage) => void): unknown
  close(): void
}

export interface WebSocketRpcTransport {
  readonly started: boolean
  start(server: Server): void
  dispose(): void
}

export interface WebSocketRpcTransportDependencies {
  provider: WebSocketProviderPort
  accounts: { getSelectedAddresses(): string[] }
  store: { endOriginSession(originId: string): void }
  origins: OriginsService
  windows: { toggleTray(): unknown }
  createServer(server: Server): WebSocketServerPort
  openReadyState: number
  timers?: ApiTimerPort
  createConnectionId?: () => string
}

const systemTimers: ApiTimerPort = {
  setTimeout: (task, delayMs) => setTimeout(task, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
}

export function createWebSocketRpcTransport({
  provider,
  accounts,
  store,
  origins,
  windows,
  createServer,
  openReadyState,
  timers = systemTimers,
  createConnectionId = uuid
}: WebSocketRpcTransportDependencies): WebSocketRpcTransport {
  const subs: Record<string, Subscription> = {}
  const connectionMonitors: Record<string, ReturnType<typeof setTimeout>> = {}
  const socketDisposers = new Map<FrameWebSocket, () => void>()
  let wsServer: WebSocketServerPort | undefined
  let active = false
  let disposed = false

  const logTraffic = (origin: string) =>
    process.env.LOG_TRAFFIC === 'true' || process.env.LOG_TRAFFIC === origin

  function extendSession(originId: string) {
    if (!originId) return

    if (connectionMonitors[originId]) timers.clearTimeout(connectionMonitors[originId])
    connectionMonitors[originId] = timers.setTimeout(() => {
      delete connectionMonitors[originId]
      store.endOriginSession(originId)
    }, 60_000)
  }

  const removeSocketSubscriptions = (socket: FrameWebSocket) => {
    Object.keys(subs).forEach((sub) => {
      if (subs[sub].socket.id !== socket.id) return
      provider.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_unsubscribe',
        _origin: subs[sub].originId,
        params: [sub]
      })
      delete subs[sub]
    })
  }

  const handler = (socket: FrameWebSocket, req: IncomingMessage) => {
    socket.id = createConnectionId()
    socket.origin = req.headers.origin
    socket.frameExtension = origins.parseFrameExtension(req)
    socket.companionInternal = Boolean(
      socket.frameExtension &&
      new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('scope') === 'internal'
    )

    const respond = (payload: RPCResponsePayload) => {
      if (socket.readyState !== openReadyState) return
      socket.send(JSON.stringify(payload), (error) => {
        if (error) log.info(error)
      })
    }

    const messageHandler = async (data: WebSocket.RawData) => {
      const rawPayload = validPayload<ExtensionPayload>(data.toString())
      if (!rawPayload) {
        log.warn('Invalid WebSocket RPC payload')
        return
      }

      let requestOrigin = socket.origin
      const proxiedExtensionRequest = Boolean(socket.frameExtension && rawPayload.__frameOrigin)
      if (socket.frameExtension) {
        if (!(await origins.isKnownExtension(socket.frameExtension))) {
          respond({
            id: rawPayload.id,
            jsonrpc: rawPayload.jsonrpc,
            error: {
              message: `Permission denied, approve connection from Newframe Companion with id ${socket.frameExtension.id} in Newframe to continue`,
              code: 4001
            }
          })
          return
        }

        if (rawPayload.__frameOrigin) {
          requestOrigin = rawPayload.__frameOrigin
          delete rawPayload.__frameOrigin
        } else {
          requestOrigin = 'newframe-extension'
        }
      }

      const requestChainId = parseRequestChainId(req)
      if (requestChainId && !rawPayload.chainId) rawPayload.chainId = requestChainId
      const origin = parseOrigin(requestOrigin)

      if (logTraffic(origin)) {
        log.info(
          `req -> | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
            rawPayload.method
          } | -> | ${rawPayload.params}`
        )
      }

      const { payload, chainId } = origins.updateOrigin(rawPayload, origin, rawPayload.__extensionConnecting)
      const principal = createRpcPrincipal({
        transport: 'websocket',
        connectionId: socket.id,
        origin,
        capabilities: socket.companionInternal ? ['wallet:internal-state'] : []
      })

      if (!isHexString(chainId)) {
        respond({
          id: rawPayload.id,
          jsonrpc: rawPayload.jsonrpc,
          error: {
            message: `Invalid chain id (${rawPayload.chainId}), chain id must be hex-prefixed string`,
            code: -1
          }
        })
        return
      }

      if (!rawPayload.__extensionConnecting) extendSession(payload._origin)

      if (socket.frameExtension && !proxiedExtensionRequest) {
        if (rawPayload.method === 'frame_summon' && socket.companionInternal) {
          windows.toggleTray()
          return
        }

        const { id, jsonrpc } = rawPayload
        if (rawPayload.method === 'eth_chainId') {
          respond({ id, jsonrpc, result: chainId })
          return
        }
        if (rawPayload.method === 'net_version') {
          respond({ id, jsonrpc, result: parseInt(chainId, 16) })
          return
        }
      }

      if (protectedMethods.includes(payload.method) && !(await origins.isTrusted(payload, principal))) {
        respond({
          id: payload.id,
          jsonrpc: payload.jsonrpc,
          error: {
            message: accounts.getSelectedAddresses()[0]
              ? `Permission denied, approve ${origin} in Newframe to continue`
              : 'No Newframe account selected',
            code: 4001
          }
        })
        return
      }

      provider.send(
        payload,
        (response) => {
          if (response?.result) {
            if (payload.method === 'eth_subscribe') {
              subs[String(response.result)] = { socket, originId: payload._origin }
            } else if (payload.method === 'eth_unsubscribe') {
              payload.params.forEach((sub) => delete subs[sub])
            }
          }

          if (logTraffic(origin)) {
            log.info(
              `<- res | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
                payload.method
              } | <- | ${JSON.stringify(response.result || response.error)}`
            )
          }
          respond(response)
        },
        principal
      )
    }

    const errorHandler = (error: Error) => log.error(error)
    const closeHandler = () => {
      removeSocketSubscriptions(socket)
      socketDisposers.get(socket)?.()
    }
    const disposeSocket = () => {
      socket.off('message', messageHandler)
      socket.off('error', errorHandler)
      socket.off('close', closeHandler)
      socketDisposers.delete(socket)
    }

    socket.on('message', messageHandler)
    socket.on('error', errorHandler)
    socket.on('close', closeHandler)
    socketDisposers.set(socket, disposeSocket)
  }

  const subscriptionHandler = (payload: RPC.Susbcription.Response) => {
    const subscription = subs[payload.params.subscription]
    if (subscription?.socket.readyState === openReadyState) {
      subscription.socket.send(JSON.stringify(payload))
    }
  }

  return {
    get started() {
      return active
    },
    start(server) {
      if (active || disposed) return

      wsServer = createServer(server)
      wsServer.on('connection', handler)
      provider.on('data:subscription', subscriptionHandler)
      active = true
    },
    dispose() {
      if (disposed) return

      disposed = true
      active = false
      provider.off('data:subscription', subscriptionHandler)
      wsServer?.off('connection', handler)
      const subscribedSockets = new Set(Object.values(subs).map(({ socket }) => socket))
      subscribedSockets.forEach(removeSocketSubscriptions)
      for (const disposeSocket of [...socketDisposers.values()]) disposeSocket()
      Object.values(connectionMonitors).forEach((timer) => timers.clearTimeout(timer))
      Object.keys(connectionMonitors).forEach((id) => delete connectionMonitors[id])
      wsServer?.close()
      wsServer = undefined
    }
  }
}
