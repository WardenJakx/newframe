import http from 'http'
import { randomUUID } from 'node:crypto'

import { desktopRouter } from '@newframe/desktop-api/router'
import { MAX_RPC_REQUEST_BYTES } from '@newframe/schema/json-rpc'
import { createHTTPHandler } from '@trpc/server/adapters/standalone'
// oxlint-disable-next-line no-restricted-imports -- The local API server accepts inbound sockets; it opens none.
import WebSocket, { WebSocketServer } from 'ws'

import type { Accounts } from '../../../features/accounts/main/index.ts'
import type { AgentService } from '../../../features/agent-access/main/index.ts'
import { createExtensionAccessService } from '../../../features/connections/main/extensionAccess.ts'
import {
  parseOrigin,
  parseRequestChainId,
  createProductionOriginsService
} from '../../../features/connections/main/origins.ts'
import type { RequestService } from '../../../features/requests/main/service.ts'
import type { FlashService } from '../../../features/transactions/trade/main/index.ts'
import { localApiPort } from '../../../platform/local-rpc/endpoint.ts'
import { createHttpRpcTransport } from '../../../platform/local-rpc/http.ts'
import { createOriginSessionMonitor, createRpcRequestHandler } from '../../../platform/local-rpc/request.ts'
import { createApiServer } from '../../../platform/local-rpc/server.ts'
import { rpcCall } from '../../../platform/local-rpc/trpc.ts'
import {
  createWebSocketRpcTransport,
  type WebSocketRpcTransportDependencies
} from '../../../platform/local-rpc/ws.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { RpcIpcHandlers } from '../ipc-handlers/rpc.ts'

export function createProductionApiServer(
  provider: RpcIpcHandlers,
  accounts: Accounts,
  flashService: FlashService,
  canonicalStore: CanonicalStoreReader,
  agentService: AgentService,
  requestService: RequestService,
  windows: WebSocketRpcTransportDependencies['windows']
) {
  const origins = createProductionOriginsService(canonicalStore, accounts, requestService)
  const storePort = {
    endOriginSession: (originId: string) => canonicalStore.getState().endOriginSession(originId)
  }
  const requestHandler = createRpcRequestHandler({ provider, origins })
  const httpTransport = createHttpRpcTransport({
    provider,
    store: storePort,
    requestHandler
  })
  const wsTransport = createWebSocketRpcTransport({
    provider,
    store: storePort,
    origins,
    requestHandler,
    windows,
    extensionAccess: createExtensionAccessService(canonicalStore),
    createServer: (server) =>
      new WebSocketServer({
        server,
        maxPayload: MAX_RPC_REQUEST_BYTES,
        verifyClient: ({ req }: { req: http.IncomingMessage }) => origins.admitsConnection(req, 'websocket')
      }),
    openReadyState: WebSocket.OPEN
  })

  const monitor = createOriginSessionMonitor({ store: storePort })
  const trpcHandler = createHTTPHandler({
    router: desktopRouter,
    basePath: '/trpc/',
    maxBodySize: MAX_RPC_REQUEST_BYTES,
    allowBatching: false,
    createContext({ req, res }) {
      const agent = agentService.createContext(req, res, provider)
      if (req.headers.authorization || req.headers['x-newframe-agent-session']) {
        return agent
      }
      const origin = parseOrigin(req.headers.origin)
      return {
        ...agent,
        rpc: (input) =>
          rpcCall((writeResponse) =>
            requestHandler({
              writeResponse,
              rawPayload: {
                id: 1,
                jsonrpc: '2.0',
                method: input.method,
                params: input.params as readonly unknown[],
                ...(input.chainId === undefined ? {} : { chainId: input.chainId })
              },
              origin,
              chainHint: parseRequestChainId(req),
              identity: { transport: 'http', connectionId: randomUUID(), origin },
              session: { monitor, refresh: 'before-validation' },
              acceptsProviderResponse: () => !res.destroyed
            })
          )
      }
    }
  })
  const nativeHttp = {
    ...httpTransport,
    get started() {
      return httpTransport.started
    },
    handler: ((req, res) => {
      if (!origins.admitsConnection(req, 'http')) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Websites must connect through the Newframe extension' }))
        return
      }
      if (new URL(req.url ?? '/', 'http://127.0.0.1').pathname.startsWith('/trpc/')) {
        res.setHeader('Cache-Control', 'no-store')
        trpcHandler(req, res)
      } else {
        httpTransport.handler(req, res)
      }
    }) as http.RequestListener,
    dispose() {
      monitor.dispose()
      httpTransport.dispose()
    }
  }
  return createApiServer({
    http: nativeHttp,
    ws: wsTransport,
    createServer: (handler) => http.createServer(handler),
    port: localApiPort()
  })
}
