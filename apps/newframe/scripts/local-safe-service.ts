import { createSafeHandler } from './local-safe/handler'

const raw = process.env.NEWFRAME_SAFE_SEED
if (!raw) throw new Error('NEWFRAME_SAFE_SEED is required; start through the Newframe harness')
const handler = createSafeHandler(JSON.parse(raw))
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.NEWFRAME_LOCAL_SAFE_PORT || 8423),
  fetch(request) {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true })
    return handler.fetch(request)
  }
})
console.log(`Local Safe service listening on ${server.url}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop(true)
    process.exit(0)
  })
}
