import { createBalanceSummarySelector, type BalanceSummary } from '../../../resources/domain/balance'

import type { Balance } from '../../../main/store/state'
import type { DappRendererState } from '../../../resources/state/projections'

export type DappWalletAccount = DappRendererState['accounts'][string]
export type DappWalletEthereumNetwork = DappRendererState['networks']['ethereum'][number]
export type DappWalletEthereumNetworkMeta = DappRendererState['networksMeta']['ethereum'][number]

export interface DappWalletSelectorValue {
  accounts: DappWalletAccount[]
  balanceSummaries: BalanceSummary[]
  currentAccount: DappWalletAccount | null
  networks: Record<string | number, DappWalletEthereumNetwork>
  networksMeta: Record<string | number, DappWalletEthereumNetworkMeta>
  runtime: DappRendererState['runtime']
}

const EMPTY_ACCOUNTS: Record<string, DappWalletAccount> = {}
const EMPTY_BALANCES: Balance[] = []
const EMPTY_NETWORKS: Record<string | number, DappWalletEthereumNetwork> = {}
const EMPTY_NETWORKS_META: Record<string | number, DappWalletEthereumNetworkMeta> = {}
const EMPTY_RATES: DappRendererState['rates'] = {}

function createOrderedAccountsSelector() {
  let previousAccountsById: Record<string, DappWalletAccount> | undefined
  let previousAccountOrder: string[] | undefined
  let previousOrderedAccounts: DappWalletAccount[] = []

  return (accountsById: Record<string, DappWalletAccount>, accountOrder?: string[]) => {
    if (accountsById === previousAccountsById && accountOrder === previousAccountOrder) {
      return previousOrderedAccounts
    }

    const order = accountOrder || Object.keys(accountsById)
    const ordered = order.map((id) => accountsById[id]).filter(Boolean)
    const missing = Object.keys(accountsById)
      .filter((id) => !order.includes(id))
      .map((id) => accountsById[id])

    previousAccountsById = accountsById
    previousAccountOrder = accountOrder
    previousOrderedAccounts = [...ordered, ...missing]

    return previousOrderedAccounts
  }
}

export function createDappWalletSelector() {
  const selectBalanceSummaries = createBalanceSummarySelector()
  const selectOrderedAccounts = createOrderedAccountsSelector()
  let previousResult: DappWalletSelectorValue | null = null

  return (state: DappRendererState): DappWalletSelectorValue => {
    const selectedAccountId = state.currentAccount
    const accountsById = state.accounts || EMPTY_ACCOUNTS
    const currentAccount = accountsById[selectedAccountId] || null
    const accounts = selectOrderedAccounts(accountsById, state.accountOrder)
    const rawBalances = currentAccount?.address
      ? state.balances[currentAccount.address] || EMPTY_BALANCES
      : EMPTY_BALANCES
    const networks = state.networks.ethereum || EMPTY_NETWORKS
    const networksMeta = state.networksMeta.ethereum || EMPTY_NETWORKS_META
    const rates = state.rates || EMPTY_RATES
    const runtime = state.runtime
    const balanceSummaries = selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => !!chain.on,
      cacheKey: currentAccount?.address || ''
    })

    if (
      previousResult &&
      previousResult.accounts === accounts &&
      previousResult.balanceSummaries === balanceSummaries &&
      previousResult.currentAccount === currentAccount &&
      previousResult.networks === networks &&
      previousResult.networksMeta === networksMeta &&
      previousResult.runtime === runtime
    ) {
      return previousResult
    }

    previousResult = {
      accounts,
      balanceSummaries,
      currentAccount,
      networks,
      networksMeta,
      runtime
    }

    return previousResult
  }
}
