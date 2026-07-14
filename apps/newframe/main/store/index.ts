import log from 'electron-log'

import createCanonicalStore from './createCanonicalStore'
import validatedConfStorage from './persist'

const canonical = createCanonicalStore(validatedConfStorage)
const store = canonical.store

if (process.env.NEWFRAME_VISUAL_HARNESS === 'true' && process.env.FRAME_PROFILE === 'dev') {
  Object.defineProperty(globalThis, '__NEWFRAME_VISUAL_HARNESS_GET_STATE__', {
    configurable: false,
    value: () => {
      const { main, windows } = store.getState()
      return JSON.parse(JSON.stringify({ main, windows }))
    },
    writable: false
  })
}

export const canonicalStoreHydration = canonical.hydration.catch((error) => {
  log.error('Canonical state hydration failed', error)
  throw error
})

export type { CanonicalActions, CanonicalStore } from './actions'
export { default as createCanonicalStore } from './createCanonicalStore'
export default store
