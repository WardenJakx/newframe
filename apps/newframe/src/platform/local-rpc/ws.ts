import type { IncomingMessage, Server } from 'http'

import log from 'electron-log'
import { v4 as uuid } from 'uuid'
import type WebSocket from 'ws'

import { embeddedImageSource } from '../../features/asset-data/domain/image/index.js'
import {
  parseOrigin,
  parseRequestChainId,
  type FrameExtension,
  type OriginsService
} from '../../features/connections/main/origins.js'
import { WebSocketJsonRpcRequestSchema, type WebSocketJsonRpcRequest } from './protocol.js'
import {
  createOriginSessionMonitor,
  type ApiTimerPort,
  type RpcProviderSendPort,
  type RpcRequestHandler
} from './request.js'
import validPayload from './validPayload.js'

function faviconSource(value: unknown): string | undefined {
  const embedded = embeddedImageSource(value)
  if (embedded) {
    return embedded
  }
  if (typeof value !== 'string' || value.length > 4096) {
    return
  }
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return
    }
  }
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')) {
      return url.toString()
    }
  } catch {
    return undefined
  }
}

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

interface WebSocketProviderPort extends RpcProviderSendPort {
  on(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
  off(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
}

interface WebSocketServerPort {
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
  store: { endOriginSession(originId: string): void }
  origins: OriginsService
  requestHandler: RpcRequestHandler
  windows: { toggleTray(): unknown }
  createServer: (server: Server) => WebSocketServerPort
  openReadyState: number
  timers?: ApiTimerPort
  createConnectionId?: () => string
}

const systemTimers: ApiTimerPort = {
  setTimeout: (task, delayMs) => setTimeout(task, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
}

function rawDataText(data: WebSocket.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8')
  }
  return Buffer.from(data).toString('utf8')
}

export function createWebSocketRpcTransport({
  provider,
  store,
  origins,
  requestHandler,
  windows,
  createServer,
  openReadyState,
  timers = systemTimers,
  createConnectionId = uuid
}: WebSocketRpcTransportDependencies): WebSocketRpcTransport {
  const subs: Record<string, Subscription> = {}
  const sessionMonitor = createOriginSessionMonitor({ store, timers })
  const socketDisposers = new Map<FrameWebSocket, () => void>()
  let wsServer: WebSocketServerPort | undefined
  let active = false
  let disposed = false

  const logTraffic = (origin: string) =>
    process.env.LOG_TRAFFIC === 'true' || process.env.LOG_TRAFFIC === origin

  const removeSocketSubscriptions = (socket: FrameWebSocket) => {
    Object.keys(subs).forEach((sub) => {
      if (subs[sub].socket.id !== socket.id) {
        return
      }
      Promise.resolve(
        provider.send({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_unsubscribe',
          _origin: subs[sub].originId,
          params: [sub]
        })
      ).catch((error: unknown) => log.error('WebSocket RPC subscription cleanup failed', error))
      delete subs[sub]
    })
  }

  const handler = (socket: FrameWebSocket, req: IncomingMessage) => {
    socket.id = createConnectionId()
    socket.origin = req.headers.origin
    socket.frameExtension = origins.parseFrameExtension(req)
    socket.companionInternal = Boolean(
      socket.frameExtension &&
      new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('scope') === 'internal'
    )

    const respond = (payload: RPCResponsePayload) => {
      if (socket.readyState !== openReadyState) {
        return
      }
      socket.send(JSON.stringify(payload), (error) => {
        if (error) {
          log.info(error)
        }
      })
    }

    const processMessage = async (data: WebSocket.RawData) => {
      const rawPayload: WebSocketJsonRpcRequest | false = validPayload(
        rawDataText(data),
        WebSocketJsonRpcRequestSchema
      )
      if (!rawPayload) {
        log.warn('Invalid WebSocket RPC payload')
        return
      }

      const faviconMetadata = rawPayload.__frameFavicon
      delete rawPayload.__frameFavicon
      try {
        let requestOrigin = socket.origin
        const proxiedExtensionRequest = Boolean(socket.frameExtension && rawPayload.__frameOrigin)
        const requestExtensionConnection =
          socket.companionInternal &&
          !proxiedExtensionRequest &&
          rawPayload.method === 'frame_requestExtensionConnection'
        if (socket.frameExtension) {
          const allowed = await origins.isKnownExtension(socket.frameExtension, requestExtensionConnection)
          if (!allowed) {
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

        const origin = parseOrigin(requestOrigin)

        if (logTraffic(origin)) {
          log.info(
            `req -> | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
              rawPayload.method
            } | -> | ${JSON.stringify(rawPayload.params)}`
          )
        }

        await requestHandler({
          rawPayload: rawPayload as JSONRPCRequestPayload,
          origin,
          chainHint: parseRequestChainId(req),
          identity: {
            transport: 'websocket',
            connectionId: socket.id,
            origin,
            capabilities: socket.companionInternal ? ['wallet:internal-state'] : []
          },
          updateOrigin: {
            connectionMessage: rawPayload.__extensionConnecting,
            faviconSource: proxiedExtensionRequest ? faviconSource(faviconMetadata) : undefined
          },
          session: {
            monitor: sessionMonitor,
            refresh: rawPayload.__extensionConnecting ? 'omit' : 'after-validation'
          },
          acceptsProviderResponse: () => true,
          writeResponse: (response) => respond(response),
          postValidationInterceptor: (context) => {
            const { chainId } = context
            if (!socket.frameExtension || proxiedExtensionRequest) {
              return false
            }
            if (rawPayload.method === 'frame_summon' && socket.companionInternal) {
              windows.toggleTray()
              return true
            }

            const { id, jsonrpc } = rawPayload
            if (rawPayload.method === 'eth_chainId' || requestExtensionConnection) {
              context.respond({ id, jsonrpc, result: chainId })
              return true
            }
            if (rawPayload.method === 'net_version') {
              context.respond({ id, jsonrpc, result: parseInt(chainId, 16) })
              return true
            }
            return false
          },
          observeProviderResponse: (response, payload) => {
            if (logTraffic(origin)) {
              log.info(
                `<- res | ${socket.frameExtension ? 'ext' : 'ws'} | ${origin} | ${
                  payload.method
                } | <- | ${JSON.stringify(response.result ?? response.error)}`
              )
            }
          },
          onSubscriptionOpen: (subscriptionId, originId) => {
            subs[subscriptionId] = { socket, originId }
          },
          onSubscriptionClose: (subscriptionIds) => {
            subscriptionIds.forEach((subscriptionId) => delete subs[String(subscriptionId)])
          },
          onError: (error) => log.error('WebSocket RPC request failed', error)
        })
      } catch (error) {
        log.error('WebSocket RPC request failed', error)
        respond({
          id: rawPayload.id,
          jsonrpc: rawPayload.jsonrpc,
          error: { code: -32603, message: 'Internal error' }
        })
      }
    }

    const messageHandler = (data: WebSocket.RawData) => {
      // Message failures are converted to RPC responses inside processMessage.
      void processMessage(data)
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
    const subscriptionId = (payload.params as { subscription?: unknown }).subscription
    if (typeof subscriptionId !== 'string') {
      return
    }
    const subscription = (subs as Record<string, Subscription | undefined>)[subscriptionId]
    if (subscription?.socket.readyState === openReadyState) {
      subscription.socket.send(JSON.stringify(payload))
    }
  }

  return {
    get started() {
      return active
    },
    start(server) {
      if (active || disposed) {
        return
      }

      wsServer = createServer(server)
      wsServer.on('connection', handler)
      provider.on('data:subscription', subscriptionHandler)
      active = true
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      active = false
      provider.off('data:subscription', subscriptionHandler)
      wsServer?.off('connection', handler)
      const subscribedSockets = new Set(Object.values(subs).map(({ socket }) => socket))
      subscribedSockets.forEach(removeSocketSubscriptions)
      for (const disposeSocket of socketDisposers.values()) {
        disposeSocket()
      }
      sessionMonitor.dispose()
      wsServer?.close()
      wsServer = undefined
    }
  }
}
