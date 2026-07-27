import { Notification } from 'electron'

import type store from '../../store'
import { createBlockExplorerOpener } from '../../windows/window'
import type { AccountsRuntime } from '../../accounts/runtime'

export type ProductionAccountsExternalAdapters = Pick<AccountsRuntime, 'persistence' | 'signers' | 'windows'>

export function createProductionAccountsRuntime(
  canonicalStore: Pick<typeof store, 'getState'>,
  external: ProductionAccountsExternalAdapters
): AccountsRuntime {
  const openBlockExplorer = createBlockExplorerOpener(canonicalStore)
  return {
    ...external,
    navigation: {
      back: (windowId, steps = 1) => canonicalStore.getState().navBack(windowId, steps),
      forward: (windowId, crumb) => canonicalStore.getState().navForward(windowId, crumb)
    },
    now: Date.now,
    notify(title, body, action) {
      const notification = new Notification({ title, body })
      if (!notification) return
      notification.on('click', action)
      setTimeout(() => notification.show(), 1000)
    },
    openBlockExplorer,
    schedule: (callback, delay) => setTimeout(callback, delay)
  }
}
