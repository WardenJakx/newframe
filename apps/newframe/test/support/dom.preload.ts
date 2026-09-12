import { afterEach } from 'bun:test'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

import './test.setup.ts'

GlobalRegistrator.register()

Object.defineProperty(Event.prototype, 'cancelBubble', {
  configurable: true,
  get() {
    return false
  },
  set: () => {}
})

let cleanup = () => {}

afterEach(() => {
  cleanup()
})
;({ cleanup } = await import('@testing-library/react'))
