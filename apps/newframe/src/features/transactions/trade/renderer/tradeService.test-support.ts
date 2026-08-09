import { mock } from 'bun:test'

import type { TradeCapability } from './tradeService'

export function createTradeCapabilityFake() {
  return {
    quote: mock<TradeCapability['quote']>(async () => {
      throw new Error('No trade quote fake configured.')
    }),
    prepare: mock<TradeCapability['prepare']>(async () => ({ ok: true })),
    submit: mock<TradeCapability['submit']>(async () => ({ ok: true })),
    release: mock<TradeCapability['release']>(async () => ({ ok: true })),
    close: mock<TradeCapability['close']>(async () => ({ ok: true })),
    hydrateTokenImage: mock<TradeCapability['hydrateTokenImage']>(async () => ({ ok: true }))
  }
}

export type TradeCapabilityFake = ReturnType<typeof createTradeCapabilityFake>
