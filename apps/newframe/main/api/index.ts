import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'

import type { Provider } from '../provider/index.js'
import type { Accounts } from '../accounts/index.js'
import type { FlashService } from '../flash/index.js'
import type { AgentService } from '../agent/index.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import { createHttpRpcTransport } from './http.js'
import {
  createWebSocketRpcTransport,
  type WebSocketRpcTransportDependencies,
  type WebSocketServerPort
} from './ws.js'
import { createApiServer } from './server.js'
import { createProductionOriginsService } from './origins.js'
import type { RequestService } from '../features/requests/service.js'

export { createApiServer, type ApiServer, type ApiServerDependencies } from './server.js'

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
