import type { Accounts } from '../../accounts/index.js'
import type { CanonicalStore } from '../../store/actions.js'

type AccountState = Pick<
  CanonicalStore,
  'clearPermissions' | 'main' | 'removeOrigin' | 'reorderAccounts' | 'revokePermission'
>

type AddressChainUsage = {
  address: string
  chainIds: number[]
  complete: boolean
}

export interface AccountServicePorts {
  accounts: Pick<Accounts, 'clearRequestsByOrigin' | 'get' | 'remove' | 'rename'>
  addressChainUsage(addresses: string[]): Promise<AddressChainUsage[]>
  selectAccount(accountId: string): Promise<unknown>
  signers: {
    get(signerId: string): { id: string; type: string } | undefined
    remove(signerId: string): void
  }
  store: { getState(): AccountState }
}

export function createAccountService(ports: AccountServicePorts) {
  return {
    addressChainUsage: ports.addressChainUsage,

    async select(accountId: string) {
      if (!ports.accounts.get(accountId)) return false
      await ports.selectAccount(accountId)
      return true
    },

    remove(address: string, removeSeedSigner = false) {
      const accountId = address.toLowerCase()
      const state = ports.store.getState()
      const account = state.main.accounts[accountId]
      if (!account) return false

      let seedSignerId = ''
      if (removeSeedSigner && account.signer) {
        const signer = ports.signers.get(account.signer)
        const hasAnotherAccount = Object.values(state.main.accounts).some(
          (candidate) => candidate.id !== accountId && candidate.signer === account.signer
        )
        if (signer?.type === 'seed' && !hasAnotherAccount) seedSignerId = signer.id
      }

      ports.accounts.remove(accountId)
      if (seedSignerId) ports.signers.remove(seedSignerId)
      return true
    },

    rename(accountId: string, name: string) {
      if (!ports.accounts.get(accountId)) return false
      ports.accounts.rename(accountId, name)
      return true
    },

    reorder(fromAccountId: string, toAccountId: string) {
      const state = ports.store.getState()
      if (!state.main.accounts[fromAccountId] || !state.main.accounts[toAccountId]) return false
      state.reorderAccounts(fromAccountId, toAccountId)
      return true
    },

    clearPermission(accountId: string, originId?: string) {
      const state = ports.store.getState()
      const permissions = state.main.permissions[accountId]
      if (!state.main.accounts[accountId] || !permissions || (originId && !permissions[originId])) {
        return false
      }

      if (originId) state.revokePermission(accountId, originId)
      else state.clearPermissions(accountId)
      return true
    },

    removeOrigin(originId: string) {
      const state = ports.store.getState()
      if (!state.main.origins[originId]) return false
      Object.keys(state.main.accounts).forEach((accountId) =>
        ports.accounts.clearRequestsByOrigin(accountId, originId)
      )
      state.removeOrigin(originId)
      return true
    }
  }
}

export type AccountService = ReturnType<typeof createAccountService>
