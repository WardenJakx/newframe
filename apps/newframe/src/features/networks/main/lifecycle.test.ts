import { expect, it, spyOn } from 'bun:test'

import store from '../../../platform/state-store/index.ts'
import { Chains } from './index.ts'

it('owns store listeners through an idempotent lifecycle', () => {
  const subscribe = spyOn(store, 'subscribe')
  const chains = new Chains(store)

  chains.start()
  const subscriptions = subscribe.mock.calls.length
  chains.start()

  expect(subscribe).toHaveBeenCalledTimes(subscriptions)

  chains.dispose()
  chains.dispose()
  store.getState().setAppLock({ locked: true, vaultExists: true })
  store.getState().setAppLock({ locked: false, vaultExists: true })

  expect(chains.connections.ethereum).toEqual({})
  subscribe.mockRestore()
})
