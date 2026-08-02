import { Notification } from 'electron'

import { arraysEqual } from '../../../domain/collections.js'
import type store from '../../store/index.js'
import { createBlockExplorerOpener } from '../../windows/window.js'
import type { Accounts } from '../../accounts/index.js'
import type { AccountsRuntime } from '../../accounts/runtime.js'
import type { Chains } from '../../chains/index.js'
import type { AccountServicePorts } from '../../features/accounts/service.js'
import type { Provider } from '../../provider/index.js'
import type { CanonicalStore } from '../../store/actions.js'
import { createOneResultCallbackBoundary } from '../callbacks/oneResult.js'

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

function addressHasTransactions(
  address: string,
  chainId: number,
  chains: Chains,
  callbacks: ReturnType<typeof createOneResultCallbackBoundary>
) {
  return callbacks.run<boolean | null>((done) => {
    chains.send(
      {
        id: `address-usage:${chainId}:${address}`,
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [address, 'latest']
      },
      (response) => {
        if (response.error) return done(null, null)
        try {
          done(null, BigInt(response.result) > 0n)
        } catch {
          done(null, null)
        }
      },
      { type: 'ethereum', id: chainId }
    )
  })
}

export function createAddressChainUsageAdapter(
  chains: Chains,
  canonicalStore: { getState(): Pick<CanonicalStore, 'main'> }
): AccountServicePorts['addressChainUsage'] & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  const addressChainUsage = async (addresses: string[]) => {
    const enabledChainIds = Object.values(canonicalStore.getState().main.networks.ethereum)
      .filter((chain) => chain.on)
      .map((chain) => chain.id)
      .sort((a, b) => a - b)

    return Promise.all(
      addresses.map(async (address) => {
        const checks = await Promise.all(
          enabledChainIds.map(async (chainId) => ({
            chainId,
            used: await addressHasTransactions(address, chainId, chains, callbacks)
          }))
        )
        return {
          address,
          chainIds: checks.filter((check) => check.used === true).map((check) => check.chainId),
          complete: checks.every((check) => check.used !== null)
        }
      })
    )
  }
  addressChainUsage.dispose = callbacks.dispose
  return addressChainUsage
}

export function createAccountSelectionAdapter(
  accounts: Pick<Accounts, 'getSelectedAddresses' | 'setSigner'>,
  provider: Pick<Provider, 'accountsChanged'>
): AccountServicePorts['selectAccount'] & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  const selectAccount = async (accountId: string) => {
    const previousAddresses = accounts.getSelectedAddresses()
    const account = await callbacks.run<Account>((done) => accounts.setSigner(accountId, done))
    const currentAddresses = accounts.getSelectedAddresses()
    if (!arraysEqual(previousAddresses, currentAddresses)) provider.accountsChanged(currentAddresses)
    return account
  }
  selectAccount.dispose = callbacks.dispose
  return selectAccount
}

export function createFeeNoticeRemovalAdapter(accounts: Pick<Accounts, 'removeFeeUpdateNotice'>) {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: callbacks.dispose,
    async remove(requestId: string) {
      await callbacks.run<true>((done) =>
        accounts.removeFeeUpdateNotice(requestId, (error) => done(error, true))
      )
    }
  }
}
