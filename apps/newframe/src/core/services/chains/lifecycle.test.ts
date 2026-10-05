import { expect, it, spyOn } from 'bun:test'

import { createChainsStatePort } from '../../../app/main/composition/chains.ts'
import { createInternet } from '../../../platform/internet/index.ts'
import store from '../../../platform/state-store/index.ts'
import { createChainsRuntime } from './runtime.ts'

it('owns store and internet listeners through an idempotent lifecycle', () => {
  const subscribe = spyOn(store, 'subscribe')
  const internet = createInternet(fetch)
  const chains = createChainsRuntime(createChainsStatePort(store), {
    isOpen: internet.isOpen,
    subscribe: (listener) => internet.subscribe(listener),
    request: internet.request,
    openWebSocket: (url, options) => internet.openWebSocket(url, options)
  })

  chains.start()
  const subscriptions = subscribe.mock.calls.length
  chains.start()

  expect(subscribe).toHaveBeenCalledTimes(subscriptions)

  chains.dispose()
  chains.dispose()
  internet.setOpen(true)

  expect(chains.hasConnection({ type: 'ethereum', id: 1 })).toBeFalse()
  subscribe.mockRestore()
})
