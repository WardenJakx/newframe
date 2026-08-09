import type { RequestListener, Server } from 'http'

import type { HttpRpcTransport } from './http.js'
import type { WebSocketRpcTransport } from './ws.js'

export interface ApiServer {
  readonly started: boolean
  start(): void
  dispose(): void
}

export interface ApiServerDependencies {
  http: HttpRpcTransport
  ws: WebSocketRpcTransport
  createServer(handler: RequestListener): Server
  host?: string
  port?: number
}

export function createApiServer({
  http: httpTransport,
  ws,
  createServer,
  host = '127.0.0.1',
  port = 1248
}: ApiServerDependencies): ApiServer {
  let server: Server | undefined
  let active = false
  let disposed = false
  const closeServer = (target: Server) => {
    try {
      target.close()
    } catch {
      // A server that failed before listen may already be closed.
    }
  }

  return {
    get started() {
      return active
    },
    start() {
      if (active || disposed) return

      const nextServer = createServer(httpTransport.handler)
      try {
        httpTransport.start()
        ws.start(nextServer)
        nextServer.listen(port, host)
        server = nextServer
        active = true
      } catch (error) {
        disposed = true
        ws.dispose()
        httpTransport.dispose()
        closeServer(nextServer)
        throw error
      }
    },
    dispose() {
      if (disposed) return

      disposed = true
      active = false
      ws.dispose()
      httpTransport.dispose()
      if (server) closeServer(server)
      server = undefined
    }
  }
}
