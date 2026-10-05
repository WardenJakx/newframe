import { expect, it, spyOn } from 'bun:test'

import store from '../../../platform/state-store/index.ts'
import { createInternet } from '../../internet/index.ts'
import { Chains } from './index.ts'

it('owns store and internet listeners through an idempotent lifecycle', () => {
  const subscribe = spyOn(store, 'subscribe')
  const internet = createInternet(fetch)
  const chains = new Chains(store, internet)

  chains.start()
  const subscriptions = subscribe.mock.calls.length
  chains.start()

  expect(subscribe).toHaveBeenCalledTimes(subscriptions)

  chains.dispose()
  chains.dispose()
  internet.setOpen(true)

  expect(chains.connections.ethereum).toEqual({})
  subscribe.mockRestore()
})
