import type { IncomingMessage, RequestListener, ServerResponse } from 'http'
import { randomUUID } from 'node:crypto'
import log from 'electron-log'
import { isHexString } from '@ethereumjs/util'

import { parseOrigin, parseRequestChainId, type OriginsService } from '../../features/connections/main/origins.js'
import validPayload from './validPayload.js'
import protectedMethods from './protectedMethods.js'
import { createRpcPrincipal, type TrustedPrincipal } from '../../features/access-control/main/authority.js'
import { isAgentHttpRequest } from '../../features/agent-access/main/index.js'

interface PendingRequest {
  send: () => void
  timer: ReturnType<typeof setTimeout>
}

interface Subscription {
  id: string
  origin: string
}

interface HTTPPollingPayload extends JSONRPCRequestPayload {
  pollId?: string
}

export interface HttpProviderPort {
  send(
    payload: RPCRequestPayload,
    respond?: (response: RPCResponsePayload) => void,
    principal?: TrustedPrincipal
  ): void
  on(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
  off(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
}

export interface HttpAccountsPort {
  getSelectedAddresses(): string[]
}

export interface HttpStorePort {
  endOriginSession(originId: string): void
}

export interface ApiTimerPort {
  setTimeout(task: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}

export interface HttpRpcTransport {
  readonly handler: RequestListener
  readonly started: boolean
  start(): void
  dispose(): void
}

export interface HttpRpcTransportDependencies {
  provider: HttpProviderPort
  accounts: HttpAccountsPort
  store: HttpStorePort
  origins: OriginsService
  handleAgentRequest: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>
  timers?: ApiTimerPort
  createConnectionId?: () => string
}

const systemTimers: ApiTimerPort = {
  setTimeout: (task, delayMs) => setTimeout(task, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
}

export function createHttpRpcTransport({
  provider,
  accounts,
  store,
  origins,
  handleAgentRequest,
  timers = systemTimers,
  createConnectionId = randomUUID
}: HttpRpcTransportDependencies): HttpRpcTransport {
  const polls: Record<string, string[]> = {}
  const pollSubs: Record<string, Subscription> = {}
  const pending: Record<string, PendingRequest> = {}
  const cleanupTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  const connectionMonitors: Record<string, ReturnType<typeof setTimeout>> = {}
  const logTraffic = process.env.LOG_TRAFFIC
  let active = false
  let disposed = false

  function extendSession(originId: string) {
    if (!originId) return

    if (connectionMonitors[originId]) timers.clearTimeout(connectionMonitors[originId])
    connectionMonitors[originId] = timers.setTimeout(() => {
      delete connectionMonitors[originId]
      store.endOriginSession(originId)
    }, 60_000)
  }

  const cleanup = (id: string) => {
    delete polls[id]
    if (pending[id]) timers.clearTimeout(pending[id].timer)
    delete pending[id]
    if (cleanupTimers[id]) timers.clearTimeout(cleanupTimers[id])
    delete cleanupTimers[id]

    Object.keys(pollSubs).forEach((sub) => {
      if (pollSubs[sub].id !== id) return
      provider.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_unsubscribe',
        params: [sub],
        _origin: pollSubs[sub].origin
      })
      delete pollSubs[sub]
    })
  }

  const subscriptionHandler = (payload: RPC.Susbcription.Response) => {
    const subscription = pollSubs[payload.params.subscription]
    if (!subscription) return

    const { id } = subscription
    polls[id] = polls[id] || []
    polls[id].push(JSON.stringify(payload))
    pending[id]?.send()
  }

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (isAgentHttpRequest(req)) {
      void handleAgentRequest(req, res)
      return
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept'
    )
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Permission Denied' }))
      return
    }

    const body: Buffer[] = []
    req
      .on('data', (chunk) => body.push(Buffer.from(chunk)))
      .on('end', async () => {
        res.on('error', (error) => log.error('HTTP response error', error))
        const data = Buffer.concat(body).toString()
        const rawPayload = validPayload<HTTPPollingPayload>(data)
        if (!rawPayload) {
          log.warn('Invalid HTTP RPC payload')
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid Payload' }))
          return
        }

        if (logTraffic) {
          log.info(
            `req -> | http | ${req.headers.origin} | ${rawPayload.method} | -> | ${JSON.stringify(
              rawPayload.params
            )}`
          )
        }

        const requestChainId = parseRequestChainId(req)
        if (requestChainId && !rawPayload.chainId) rawPayload.chainId = requestChainId

        const origin = parseOrigin(req.headers.origin)
        const { payload, chainId } = origins.updateOrigin(rawPayload, origin)
        const principal = createRpcPrincipal({
          transport: 'http',
          connectionId: createConnectionId(),
          origin
        })
        extendSession(payload._origin)

        if (!isHexString(chainId)) {
          const error = {
            message: `Invalid chain id (${rawPayload.chainId}), chain id must be hex-prefixed string`,
            code: -1
          }
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: payload.id, jsonrpc: payload.jsonrpc, error }))
          return
        }

        if (protectedMethods.includes(payload.method) && !(await origins.isTrusted(payload, principal))) {
          const error = {
            message: accounts.getSelectedAddresses()[0]
              ? `Permission denied, approve ${origin} in Newframe to continue`
              : 'No Newframe account selected',
            code: 4001
          }
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: payload.id, jsonrpc: payload.jsonrpc, error }))
          return
        }

        if (payload.method === 'eth_pollSubscriptions') {
          const id = payload.params[0]
          if (typeof id !== 'string') {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid Client ID' }))
            return
          }

          const send = (force: boolean) => {
            const result = polls[id] || []
            if (result.length || payload.params[1] === 'immediate' || force) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              const response = { id: payload.id, jsonrpc: payload.jsonrpc, result }
              if (logTraffic) {
                log.info(`<- res | http | ${origin} | ${payload.method} | <- | ${JSON.stringify(response)}`)
              }
              res.end(JSON.stringify(response))
              delete polls[id]
              if (cleanupTimers[id]) timers.clearTimeout(cleanupTimers[id])
              cleanupTimers[id] = timers.setTimeout(() => cleanup(id), 20_000)
              return
            }

            const sendResponse = () => {
              if (pending[id]) timers.clearTimeout(pending[id].timer)
              delete pending[id]
              send(true)
            }
            pending[id] = {
              send: sendResponse,
              timer: timers.setTimeout(sendResponse, 15_000)
            }
          }

          send(false)
          return
        }

        provider.send(
          payload,
          (response) => {
            if (response?.result) {
              if (payload.method === 'eth_subscribe') {
                pollSubs[String(response.result)] = {
                  id: rawPayload.pollId || '',
                  origin: payload._origin
                }
              } else if (payload.method === 'eth_unsubscribe') {
                payload.params.forEach((sub) => delete pollSubs[sub])
              }
            }

            if (logTraffic) {
              log.info(
                `<- res | http | ${req.headers.origin} | ${payload.method} | <- | ${JSON.stringify(response)}`
              )
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          },
          principal
        )
      })
      .on('error', (error) => log.error('HTTP request error', error))
  }

  return {
    handler,
    get started() {
      return active
    },
    start() {
      if (active || disposed) return
      active = true
      provider.on('data:subscription', subscriptionHandler)
    },
    dispose() {
      if (disposed) return

      disposed = true
      active = false
      provider.off('data:subscription', subscriptionHandler)
      const pollIds = new Set([
        ...Object.keys(polls),
        ...Object.keys(pending),
        ...Object.keys(cleanupTimers),
        ...Object.values(pollSubs).map(({ id }) => id)
      ])
      pollIds.forEach(cleanup)
      Object.values(connectionMonitors).forEach((timer) => timers.clearTimeout(timer))
      Object.keys(connectionMonitors).forEach((id) => delete connectionMonitors[id])
    }
  }
}
