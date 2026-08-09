import { mock } from 'bun:test'

import type { SendCapability } from './sendService'

export function createSendCapabilityFake() {
  return {
    submit: mock<SendCapability['submit']>(async () => ({ ok: true })),
    close: mock<SendCapability['close']>(async () => ({ ok: true })),
    writeText: mock<SendCapability['writeText']>(async () => ({ ok: true })),
    hydrateTokenImage: mock<SendCapability['hydrateTokenImage']>(async () => ({ ok: true }))
  }
}

export type SendCapabilityFake = ReturnType<typeof createSendCapabilityFake>
