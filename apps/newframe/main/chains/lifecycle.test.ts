import { expect, it } from 'bun:test'

import { electronMock } from '../../test/support/electron.mock'
import { Chains } from './index'
import store from '../store'

it('owns power and store listeners through an idempotent lifecycle', () => {
  const chains = new Chains(store)

  expect(electronMock.powerMonitor.on).not.toHaveBeenCalled()

  chains.start()
  chains.start()

  expect(electronMock.powerMonitor.on).toHaveBeenCalledTimes(4)

  chains.dispose()
  chains.dispose()

  expect(electronMock.powerMonitor.off).toHaveBeenCalledTimes(4)
})
