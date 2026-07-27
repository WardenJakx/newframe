import { expect, it } from 'bun:test'

import { createDeferredAccountRequestPort, type AccountRequestPort } from './accountRequestPort'

function accountCapability(id: string) {
  return {
    current() {
      return { id }
    }
  } as AccountRequestPort
}

it('fails closed until the provider account request capability is connected', () => {
  const deferred = createDeferredAccountRequestPort()

  expect(() => deferred.port.current()).toThrow('Provider account request capability is not connected')
})

it('uses fresh bound capabilities without losing method receivers', () => {
  const deferred = createDeferredAccountRequestPort()
  const first = accountCapability('first')
  const second = accountCapability('second')
  const disconnectFirst = deferred.connect(first)
  const disconnectSecond = deferred.connect(second)

  expect(deferred.port.current()?.id).toBe('second')
  disconnectSecond()
  expect(deferred.port.current()?.id).toBe('first')
  disconnectFirst()
  expect(() => deferred.port.current()).toThrow('Provider account request capability is not connected')
})
