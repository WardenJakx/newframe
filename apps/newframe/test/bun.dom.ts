import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { afterEach, mock } from 'bun:test'

import { linkMock, persistMock, storeMock } from './bun.mocks'

GlobalRegistrator.register()

Object.defineProperty(Event.prototype, 'cancelBubble', {
  configurable: true,
  get() {
    return false
  },
  set: () => {}
})

mock.module('../main/store/persist', () => ({ default: persistMock, ...persistMock }))
mock.module('../main/store', () => ({ default: storeMock, ...storeMock }))
mock.module('../resources/link', () => ({ default: linkMock, ...linkMock }))

import './bun.setup'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cleanup } = require('@testing-library/react') as typeof import('@testing-library/react')

afterEach(() => {
  cleanup()
})
