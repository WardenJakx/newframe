import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'

import type { Provider } from '../../../features/connections/main/provider/index.js'
import type { Accounts } from '../../../features/accounts/main/index.js'
import type { FlashService } from '../../../features/transactions/trade/main/index.js'
import type { AgentService } from '../../../features/agent-access/main/index.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import { createHttpRpcTransport } from '../../../platform/local-rpc/http.js'
import {
  createWebSocketRpcTransport,
  type WebSocketRpcTransportDependencies,
  type WebSocketServerPort
} from '../../../platform/local-rpc/ws.js'
import { createApiServer } from '../../../platform/local-rpc/server.js'
import { createProductionOriginsService } from '../../../features/connections/main/origins.js'
import type { RequestService } from '../../../features/requests/main/service.js'

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
  const httpTransport = createHttpRpcTransport({
    provider,
    accounts,
    store: storePort,
    origins,
    handleAgentRequest: agentService.createHttpHandler(provider)
  })
  const wsTransport = createWebSocketRpcTransport({
    provider,
    accounts,
    store: storePort,
    origins,
    windows,
    createServer: (server) => new WebSocketServer({ server }) as WebSocketServerPort,
    openReadyState: WebSocket.OPEN
  })

  return createApiServer({
    http: httpTransport,
    ws: wsTransport,
    createServer: (handler) => http.createServer(handler)
  })
}
