import type { ExtensionAccounts } from '@newframe/desktop-api/schemas'

import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import {
  activeExtensionAccountId,
  extensionAccess,
  visibleExtensionAccountIds
} from '../domain/extensionAccess.ts'

type View = CanonicalStore['view']

const isAccessPromptOpen = (view: View, extensionId: string) =>
  view.notify === 'extensionAccess' && (view.notifyData as { id?: unknown } | undefined)?.id === extensionId

export function createExtensionAccessService(store: Pick<CanonicalStoreReader, 'getState' | 'subscribe'>) {
  const describe = (extensionId: string): ExtensionAccounts => {
    const { main } = store.getState()
    const account = (id: string) => main.accounts[id]
    const active = activeExtensionAccountId(main, extensionId)
    return {
      accounts: visibleExtensionAccountIds(main, extensionId).map((id) => ({
        address: account(id).address,
        name: account(id).name
      })),
      selected: active ? account(active).address : '',
      ...(extensionAccess(main, extensionId).all ? { all: true } : {})
    }
  }

  return {
    accounts: describe,

    select(extensionId: string, address: string) {
      const { main, selectExtensionAccount } = store.getState()
      const accountId = visibleExtensionAccountIds(main, extensionId).find(
        (id) => main.accounts[id].address.toLowerCase() === address.toLowerCase()
      )
      if (accountId) {
        selectExtensionAccount(extensionId, accountId)
      }
      return describe(extensionId)
    },

    /** Asks the human which accounts the extension may see. Settles when the prompt closes. */
    request(extensionId: string) {
      const state = store.getState()
      if (!isAccessPromptOpen(state.view, extensionId)) {
        state.notify('extensionAccess', { id: extensionId })
      }
      return new Promise<ExtensionAccounts>((resolve) => {
        const unsubscribe = store.subscribe((current) => {
          if (!isAccessPromptOpen(current.view, extensionId)) {
            unsubscribe()
            resolve(describe(extensionId))
          }
        })
      })
    }
  }
}

export type ExtensionAccessService = ReturnType<typeof createExtensionAccessService>
