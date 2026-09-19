import { safeProposalSchema } from '../src/features/accounts/domain/safe'
import { createSafeHandler } from './local-safe/handler'

const raw = process.env.NEWFRAME_SAFE_SEED
if (!raw) {
  throw new Error('NEWFRAME_SAFE_SEED is required; start through the Newframe harness')
}
const seed: unknown = JSON.parse(raw)
if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
  throw new Error('NEWFRAME_SAFE_SEED must be a JSON object')
}
const chainId = 'chainId' in seed ? seed.chainId : undefined
const safe = 'safe' in seed ? seed.safe : undefined
const owners = 'owners' in seed ? seed.owners : undefined
const threshold = 'threshold' in seed ? seed.threshold : undefined
if (
  typeof chainId !== 'number' ||
  typeof safe !== 'string' ||
  !Array.isArray(owners) ||
  !owners.every((owner): owner is string => typeof owner === 'string') ||
  typeof threshold !== 'number'
) {
  throw new Error('NEWFRAME_SAFE_SEED is missing required Safe configuration')
}
const optionalString = (value: unknown, key: 'version' | 'nonce') => {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`NEWFRAME_SAFE_SEED ${key} must be a string`)
  }
  return value
}
const includeMismatch = 'includeMismatch' in seed ? seed.includeMismatch : undefined
const pageSize = 'pageSize' in seed ? seed.pageSize : undefined
if (includeMismatch !== undefined && typeof includeMismatch !== 'boolean') {
  throw new Error('NEWFRAME_SAFE_SEED includeMismatch must be a boolean')
}
if (pageSize !== undefined && typeof pageSize !== 'number') {
  throw new Error('NEWFRAME_SAFE_SEED pageSize must be a number')
}
const handler = createSafeHandler({
  chainId,
  safe,
  owners,
  threshold,
  version: optionalString('version' in seed ? seed.version : undefined, 'version'),
  nonce: optionalString('nonce' in seed ? seed.nonce : undefined, 'nonce'),
  includeMismatch,
  pageSize,
  proposals:
    'proposals' in seed && seed.proposals !== undefined
      ? safeProposalSchema.array().parse(seed.proposals)
      : undefined
})
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.NEWFRAME_LOCAL_SAFE_PORT ?? 8423),
  fetch(request) {
    if (new URL(request.url).pathname === '/health') {
      return Response.json({ ok: true })
    }
    return handler.fetch(request)
  }
})
console.log(`Local Safe service listening on ${server.url}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop(true).then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('Could not stop local Safe service', error)
        process.exit(1)
      }
    )
  })
}
