import http, { type Server } from 'http'
import WebSocket from 'ws'

import type { Provider } from '../provider'
import type { Accounts } from '../accounts'
import type { FlashService } from '../flash'
import type { AgentService } from '../agent'
import type { CanonicalStoreReader } from '../store/actions'
import { createHttpRpcTransport } from './http'
import {
  createWebSocketRpcTransport,
  type WebSocketRpcTransportDependencies,
  type WebSocketServerPort
} from './ws'
import { createApiServer } from './server'
import { createProductionOriginsService } from './origins'

export { createApiServer, type ApiServer, type ApiServerDependencies } from './server'

const WebSocketServer = (
  WebSocket as unknown as { Server: new (options: { server: Server }) => WebSocketServerPort }
).Server

export function createProductionApiServer(
  provider: Provider,
  accounts: Accounts,
  flashService: FlashService,
  canonicalStore: CanonicalStoreReader,
  agentService: AgentService,
  windows: WebSocketRpcTransportDependencies['windows']
) {
  const origins = createProductionOriginsService(canonicalStore, accounts)
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
    createServer: (server) => new WebSocketServer({ server }),
    openReadyState: WebSocket.OPEN
  })

  return createApiServer({
    http: httpTransport,
    ws: wsTransport,
    createServer: (handler) => http.createServer(handler)
  })
}
