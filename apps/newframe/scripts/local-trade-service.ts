import type { ServerWebSocket } from 'bun'

import {
  handleLocalTradeRequest,
  localOpenOrderSnapshot,
  subscribeLocalTradeOrders
} from './local-trade/handler'

const hostname = process.env.FLASH_LOCAL_TRADE_HOST || '127.0.0.1'
const port = Number(process.env.FLASH_LOCAL_TRADE_PORT || 8422)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid FLASH_LOCAL_TRADE_PORT: ${process.env.FLASH_LOCAL_TRADE_PORT}`)
}

type LocalFlashSocketData = {
  apiKey: string
  counter: number
  funderAddress: string
  subscriptions: Set<string>
}

const sockets = new Set<ServerWebSocket<LocalFlashSocketData>>()

function send(socket: ServerWebSocket<LocalFlashSocketData>, payload: unknown) {
  socket.send(JSON.stringify(payload))
}

function acknowledge(socket: ServerWebSocket<LocalFlashSocketData>) {
  send(socket, {
    channel: 'subscriptions',
    type: 'ack',
    subscriptions: [...socket.data.subscriptions]
  })
}

function sendError(socket: ServerWebSocket<LocalFlashSocketData>, code: string, message: string) {
  send(socket, { type: 'error', code, message })
}

function subscribe(socket: ServerWebSocket<LocalFlashSocketData>, frame: Record<string, any>) {
  const apiKey = String(frame.apiKey || '').trim()
  if (!apiKey || (socket.data.apiKey && socket.data.apiKey !== apiKey)) {
    sendError(socket, 'UNAUTHORIZED', 'apiKey does not match this connection')
    return
  }
  socket.data.apiKey = apiKey

  if (frame.channel === 'orders') {
    const funderAddress = String(frame.funderAddress || '')
      .trim()
      .toLowerCase()
    if (!funderAddress) {
      sendError(socket, 'FUNDER_REQUIRED', 'orders subscriptions require funderAddress')
      return
    }
    if (socket.data.funderAddress && socket.data.funderAddress !== funderAddress) {
      sendError(socket, 'FUNDER_LOCKED', 'this connection is already scoped to another funder')
      return
    }

    socket.data.funderAddress = funderAddress
    socket.data.subscriptions.add('orders')
    acknowledge(socket)
    send(socket, {
      channel: 'orders',
      type: 'snapshot',
      orders: localOpenOrderSnapshot(funderAddress)
    })
    return
  }

  if (frame.channel === 'heartbeats') {
    socket.data.subscriptions.add('heartbeats')
    acknowledge(socket)
    return
  }

  sendError(socket, 'UNKNOWN_CHANNEL', `unknown channel: ${String(frame.channel || '')}`)
}

const server = Bun.serve<LocalFlashSocketData>({
  hostname,
  port,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname !== '/v1/ws') return handleLocalTradeRequest(req)

    const upgraded = server.upgrade(req, {
      data: {
        apiKey: '',
        counter: 0,
        funderAddress: '',
        subscriptions: new Set()
      }
    })
    return upgraded ? undefined : new Response('WebSocket upgrade required', { status: 426 })
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    message(socket, message) {
      let frame: Record<string, any>
      try {
        const parsed = JSON.parse(String(message))
        frame = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        sendError(socket, 'BAD_JSON', 'message must be valid JSON')
        return
      }

      if (frame.type === 'subscribe') {
        subscribe(socket, frame)
        return
      }
      if (frame.type === 'unsubscribe') {
        socket.data.subscriptions.delete(String(frame.channel || ''))
        acknowledge(socket)
        return
      }

      sendError(socket, 'UNKNOWN_TYPE', `unknown message type: ${String(frame.type || '')}`)
    },
    close(socket) {
      sockets.delete(socket)
    }
  }
})

subscribeLocalTradeOrders((order) => {
  const funderAddress = String(order.funderAddress || order.accountAddress || '').toLowerCase()
  for (const socket of sockets) {
    if (!socket.data.subscriptions.has('orders') || socket.data.funderAddress !== funderAddress) continue
    send(socket, { channel: 'orders', type: 'update', orders: [order] })
  }
})

setInterval(() => {
  const timestamp = new Date().toISOString()
  for (const socket of sockets) {
    if (!socket.data.subscriptions.has('heartbeats')) continue
    socket.data.counter += 1
    send(socket, {
      channel: 'heartbeats',
      type: 'heartbeat',
      counter: socket.data.counter,
      timestamp
    })
  }
}, 1_000)

console.log(`[local-trade] listening on http://${server.hostname}:${server.port}`)
