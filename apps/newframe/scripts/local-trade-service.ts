import { handleLocalTradeRequest } from './local-trade/handler'

const hostname = process.env.FLASH_LOCAL_TRADE_HOST || '127.0.0.1'
const port = Number(process.env.FLASH_LOCAL_TRADE_PORT || 8422)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid FLASH_LOCAL_TRADE_PORT: ${process.env.FLASH_LOCAL_TRADE_PORT}`)
}

const server = Bun.serve({
  hostname,
  port,
  fetch: handleLocalTradeRequest
})

console.log(`[local-trade] listening on http://${server.hostname}:${server.port}`)
