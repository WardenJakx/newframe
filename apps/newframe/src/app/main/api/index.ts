import http from 'http'

import WebSocket, { WebSocketServer } from 'ws'

import type { Accounts } from '../../../features/accounts/main/index.js'
import type { AgentService } from '../../../features/agent-access/main/index.js'
import { createProductionOriginsService } from '../../../features/connections/main/origins.js'
import type { Provider } from '../../../features/connections/main/provider/index.js'
import type { RequestService } from '../../../features/requests/main/service.js'
import type { FlashService } from '../../../features/transactions/trade/main/index.js'
import { createHttpRpcTransport } from '../../../platform/local-rpc/http.js'
import { createRpcRequestHandler } from '../../../platform/local-rpc/request.js'
import { createApiServer } from '../../../platform/local-rpc/server.js'
import {
  createWebSocketRpcTransport,
  type WebSocketRpcTransportDependencies
} from '../../../platform/local-rpc/ws.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'

export function createProductionApiServer(
  provider: Provider,
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
  const requestHandler = createRpcRequestHandler({ provider, accounts, origins })
  const httpTransport = createHttpRpcTransport({
    provider,
    store: storePort,
    requestHandler,
    handleAgentRequest: agentService.createHttpHandler(provider)
  })
  const wsTransport = createWebSocketRpcTransport({
    provider,
    store: storePort,
    origins,
    requestHandler,
    windows,
    createServer: (server) => new WebSocketServer({ server }),
    openReadyState: WebSocket.OPEN
  })

  return createApiServer({
    http: httpTransport,
    ws: wsTransport,
    createServer: (handler) => http.createServer(handler),
    ...(process.env.NEWFRAME_VISUAL_HARNESS === 'true'
      ? { port: Number(process.env.NEWFRAME_HARNESS_RPC_PORT ?? 1249) }
      : {})
  })
}
