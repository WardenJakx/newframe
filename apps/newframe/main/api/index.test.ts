import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createApiServer } from './server'

class FakeHttpServer extends EventEmitter {
  readonly listens: Array<{ port: number; host: string }> = []
  closed = false

  listen(port: number, host: string) {
    this.listens.push({ port, host })
    return this
  }

  close() {
    this.closed = true
    return this
  }
}

it('starts transports on one server and disposes every owned resource idempotently', () => {
  const events: string[] = []
  const server = new FakeHttpServer()
  const http = {
    handler: () => undefined,
    started: false,
    start() {
      this.started = true
      events.push('http:start')
    },
    dispose() {
      this.started = false
      events.push('http:dispose')
    }
  }
  const ws = {
    started: false,
    start(receivedServer: unknown) {
      expect(receivedServer).toBe(server)
      this.started = true
      events.push('ws:start')
    },
    dispose() {
      this.started = false
      events.push('ws:dispose')
    }
  }
  const api = createApiServer({
    http,
    ws,
    createServer: () => server as never
  })

  api.start()
  api.start()
  expect({
    events,
    listens: server.listens,
    started: api.started
  }).toEqual({
    events: ['http:start', 'ws:start'],
    listens: [{ port: 1248, host: '127.0.0.1' }],
    started: true
  })

  api.dispose()
  api.dispose()
  expect({
    events,
    serverClosed: server.closed,
    started: api.started
  }).toEqual({
    events: ['http:start', 'ws:start', 'ws:dispose', 'http:dispose'],
    serverClosed: true,
    started: false
  })
})

it('rolls back both transports and closes the server when listen fails', () => {
  const events: string[] = []
  const server = new FakeHttpServer()
  server.listen = () => {
    throw new Error('address in use')
  }
  const api = createApiServer({
    http: {
      handler: () => undefined,
      started: false,
      start: () => events.push('http:start'),
      dispose: () => events.push('http:dispose')
    },
    ws: {
      started: false,
      start: () => events.push('ws:start'),
      dispose: () => events.push('ws:dispose')
    },
    createServer: () => server as never
  })

  expect(() => api.start()).toThrow('address in use')
  expect({ events, serverClosed: server.closed, started: api.started }).toEqual({
    events: ['http:start', 'ws:start', 'ws:dispose', 'http:dispose'],
    serverClosed: true,
    started: false
  })
})
