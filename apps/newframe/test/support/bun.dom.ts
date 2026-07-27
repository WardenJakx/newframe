import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { afterEach, beforeEach, mock } from 'bun:test'

import { installRendererClient, resetRendererClient } from './rendererClient'
import './test.setup.ts'
import './toMatchPath'

GlobalRegistrator.register()

Object.defineProperty(Event.prototype, 'cancelBubble', {
  configurable: true,
  get() {
    return false
  },
  set: () => {}
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cleanup } = require('@testing-library/react') as typeof import('@testing-library/react')

beforeEach(() => {
  mock.clearAllMocks()
  resetRendererClient()
  installRendererClient()
})

afterEach(() => {
  cleanup()
})
