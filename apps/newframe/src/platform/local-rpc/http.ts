import type { IncomingMessage, RequestListener, ServerResponse } from 'http'
import { randomUUID } from 'node:crypto'

import log from 'electron-log'

import { isAgentHttpRequest } from '../../features/agent-access/main/index.js'
import { parseOrigin, parseRequestChainId } from '../../features/connections/main/origins.js'
import {
  createOriginSessionMonitor,
  type ApiTimerPort,
  type RpcProviderSendPort,
  type RpcRequestHandler,
  type RpcResponseReason
} from './request.js'
import validPayload from './validPayload.js'

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

interface HttpProviderPort extends RpcProviderSendPort {
  on(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
  off(event: 'data:subscription', listener: (payload: RPC.Susbcription.Response) => void): unknown
}

interface HttpStorePort {
  endOriginSession(originId: string): void
}

export interface HttpRpcTransport {
  readonly handler: RequestListener
  readonly started: boolean
  start(): void
  dispose(): void
}

export interface HttpRpcTransportDependencies {
  provider: HttpProviderPort
  store: HttpStorePort
  requestHandler: RpcRequestHandler
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
  store,
  requestHandler,
  handleAgentRequest,
  timers = systemTimers,
  createConnectionId = randomUUID
}: HttpRpcTransportDependencies): HttpRpcTransport {
  const polls: Record<string, string[]> = {}
  const pollSubs: Record<string, Subscription> = {}
  const pending: Record<string, PendingRequest> = {}
  const cleanupTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  const sessionMonitor = createOriginSessionMonitor({ store, timers })
  const logTraffic = process.env.LOG_TRAFFIC
  let active = false
  let disposed = false

  const cleanup = (id: string) => {
    delete polls[id]
    if (pending[id]) {
      timers.clearTimeout(pending[id].timer)
    }
    delete pending[id]
    if (cleanupTimers[id]) {
      timers.clearTimeout(cleanupTimers[id])
    }
    delete cleanupTimers[id]

    Object.keys(pollSubs).forEach((sub) => {
      if (pollSubs[sub].id !== id) {
        return
      }
      Promise.resolve(
        provider.send({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_unsubscribe',
          params: [sub],
          _origin: pollSubs[sub].origin
        })
      ).catch((error) => log.error('HTTP RPC subscription cleanup failed', error))
      delete pollSubs[sub]
    })
  }

  const subscriptionHandler = (payload: RPC.Susbcription.Response) => {
    const subscription = pollSubs[payload.params.subscription]
    if (!subscription) {
      return
    }

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
    const processRequest = async () => {
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

      const origin = parseOrigin(req.headers.origin)
      const writeResponse = (response: RPCResponsePayload, reason: RpcResponseReason) => {
        if (res.writableEnded) {
          return
        }
        let status = 200
        if (reason === 'internal-error') {
          status = 500
        } else if (reason === 'invalid-chain' || reason === 'permission-denied') {
          status = 401
        }
        if (!res.headersSent) {
          res.writeHead(status, { 'Content-Type': 'application/json' })
        }
        res.end(JSON.stringify(response))
      }

      await requestHandler({
        rawPayload,
        origin,
        chainHint: parseRequestChainId(req),
        identity: {
          transport: 'http',
          connectionId: createConnectionId(),
          origin
        },
        session: { monitor: sessionMonitor, refresh: 'before-validation' },
        acceptsProviderResponse: () => !res.writableEnded,
        writeResponse,
        postValidationInterceptor: ({ payload }) => {
          if (payload.method !== 'eth_pollSubscriptions') {
            return false
          }
          const id = payload.params[0]
          if (typeof id !== 'string') {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid Client ID' }))
            return true
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
              if (cleanupTimers[id]) {
                timers.clearTimeout(cleanupTimers[id])
              }
              cleanupTimers[id] = timers.setTimeout(() => cleanup(id), 20_000)
              return
            }

            const sendResponse = () => {
              if (pending[id]) {
                timers.clearTimeout(pending[id].timer)
              }
              delete pending[id]
              send(true)
            }
            pending[id] = {
              send: sendResponse,
              timer: timers.setTimeout(sendResponse, 15_000)
            }
          }

          send(false)
          return true
        },
        observeProviderResponse: (response, payload) => {
          if (logTraffic) {
            log.info(
              `<- res | http | ${req.headers.origin} | ${payload.method} | <- | ${JSON.stringify(response)}`
            )
          }
        },
        onSubscriptionOpen: (subscriptionId, originId) => {
          pollSubs[subscriptionId] = { id: rawPayload.pollId || '', origin: originId }
        },
        onSubscriptionClose: (subscriptionIds) => {
          subscriptionIds.forEach((subscriptionId) => delete pollSubs[String(subscriptionId)])
        },
        onError: (error) => log.error('HTTP RPC request failed', error)
      })
    }
    req
      .on('data', (chunk) => body.push(Buffer.from(chunk)))
      .on('end', () => {
        // Request failures are converted to HTTP responses inside processRequest.
        void processRequest()
      })
      .on('error', (error) => log.error('HTTP request error', error))
  }

  return {
    handler,
    get started() {
      return active
    },
    start() {
      if (active || disposed) {
        return
      }
      active = true
      provider.on('data:subscription', subscriptionHandler)
    },
    dispose() {
      if (disposed) {
        return
      }

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
      sessionMonitor.dispose()
    }
  }
}
