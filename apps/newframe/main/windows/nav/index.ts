// Manage navigation states for each window

import type canonicalStore from '../../store/index.js'
import type { Breadcrumb } from './breadcrumb.js'

export const createNavigation = (store: typeof canonicalStore) => ({
  forward: (windowId: string, crumb: Breadcrumb) => {
    // Adds new crumb to nav array
    store.getState().navForward(windowId, crumb)
  },
  back: (windowId: string, steps = 1) => {
    // Removes last crumb from nav array
    store.getState().navBack(windowId, steps)
  },
  update: (windowId: string, crumb: Breadcrumb, navigate = true) => {
    // Updated last crumb in nav array with new data
    // Replaces last crumb when navigate is false
    // Adds new crumb to nav array when navigate is true
    store.getState().navUpdate(windowId, crumb, navigate)
  }
})
