import { expect, it, spyOn } from 'bun:test'

import { createOutbound } from '../../../platform/outbound/index.ts'
import store from '../../../platform/state-store/index.ts'
import { Chains } from './index.ts'

it('owns store and outbound listeners through an idempotent lifecycle', () => {
  const subscribe = spyOn(store, 'subscribe')
  const outbound = createOutbound(fetch)
  const chains = new Chains(store, outbound)

  chains.start()
  const subscriptions = subscribe.mock.calls.length
  chains.start()

  expect(subscribe).toHaveBeenCalledTimes(subscriptions)

  chains.dispose()
  chains.dispose()
  outbound.setOpen(true)

  expect(chains.connections.ethereum).toEqual({})
  subscribe.mockRestore()
})
