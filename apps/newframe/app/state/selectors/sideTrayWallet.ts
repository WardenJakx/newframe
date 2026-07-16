import { createBalanceSummarySelector, type BalanceSummary } from '../../../resources/domain/balance'

import type { Balance } from '../../../main/store/state'
import type { SideTrayRendererState } from '../../../resources/state/projections'

export type SideTrayWalletAccount = SideTrayRendererState['accounts'][string]
export type SideTrayWalletEthereumNetwork = SideTrayRendererState['networks']['ethereum'][number]
export type SideTrayWalletEthereumNetworkMeta = SideTrayRendererState['networksMeta']['ethereum'][number]

export interface SideTrayWalletSelectorValue {
  accounts: SideTrayWalletAccount[]
  balanceSummaries: BalanceSummary[]
  currentAccount: SideTrayWalletAccount | null
  networks: Record<string | number, SideTrayWalletEthereumNetwork>
  networksMeta: Record<string | number, SideTrayWalletEthereumNetworkMeta>
  runtime: SideTrayRendererState['runtime']
}

const EMPTY_ACCOUNTS: Record<string, SideTrayWalletAccount> = {}
const EMPTY_BALANCES: Balance[] = []
const EMPTY_NETWORKS: Record<string | number, SideTrayWalletEthereumNetwork> = {}
const EMPTY_NETWORKS_META: Record<string | number, SideTrayWalletEthereumNetworkMeta> = {}
const EMPTY_RATES: SideTrayRendererState['rates'] = {}

function createOrderedAccountsSelector() {
  let previousAccountsById: Record<string, SideTrayWalletAccount> | undefined
  let previousAccountOrder: string[] | undefined
  let previousOrderedAccounts: SideTrayWalletAccount[] = []

  return (accountsById: Record<string, SideTrayWalletAccount>, accountOrder?: string[]) => {
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

export function createSideTrayWalletSelector() {
  const selectBalanceSummaries = createBalanceSummarySelector()
  const selectOrderedAccounts = createOrderedAccountsSelector()
  let previousResult: SideTrayWalletSelectorValue | null = null

  return (state: SideTrayRendererState): SideTrayWalletSelectorValue => {
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
