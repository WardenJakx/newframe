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

let cleanup = () => {}

beforeEach(() => {
  mock.clearAllMocks()
  resetRendererClient()
  installRendererClient()
})

afterEach(() => {
  cleanup()
})
;({ cleanup } = await import('@testing-library/react'))
