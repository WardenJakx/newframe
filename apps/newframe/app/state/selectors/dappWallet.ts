import { createBalanceSummarySelector, type BalanceSummary } from '../../../resources/domain/balance'

import type { Balance, Rate } from '../../../main/store/state'
import type { RendererState } from '../rendererStore'

export interface DappWalletAccount {
  address?: string
  ensName?: string
  id?: string
  lastSignerType?: string
  name?: string
}

export interface DappWalletEthereumNetwork {
  id?: number
  isTestnet?: boolean
  name?: string
  on?: boolean
  [key: string]: unknown
}

export interface DappWalletEthereumNetworkMeta {
  icon?: string
  nativeCurrency?: {
    decimals?: number
    icon?: string
    name?: string
    symbol?: string
    usd?: Rate
  }
  primaryColor?: string
  [key: string]: unknown
}

export interface DappWalletSelectorValue {
  accounts: DappWalletAccount[]
  balanceSummaries: BalanceSummary[]
  currentAccount: DappWalletAccount | null
  networks: Record<string | number, DappWalletEthereumNetwork>
  networksMeta: Record<string | number, DappWalletEthereumNetworkMeta>
}

interface DappWalletRendererState extends RendererState {
  main?: {
    accountOrder?: string[]
    accounts?: Record<string, DappWalletAccount>
    balances?: Record<string, Balance[]>
    networks?: {
      ethereum?: Record<string | number, DappWalletEthereumNetwork>
    }
    networksMeta?: {
      ethereum?: Record<string | number, DappWalletEthereumNetworkMeta>
    }
    rates?: Record<string, { usd?: Rate }>
  }
  selected?: {
    current?: string
  }
}

function createOrderedAccountsSelector() {
  let previousAccountsById: Record<string, DappWalletAccount> | undefined
  let previousAccountOrder: string[] | undefined
  let previousOrderedAccounts: DappWalletAccount[] = []

  return (accountsById: Record<string, DappWalletAccount> = {}, accountOrder?: string[]) => {
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

  return (state: DappWalletRendererState): DappWalletSelectorValue => {
    const main = state.main || {}
    const selectedAccountId = state.selected?.current || ''
    const accountsById = main.accounts || {}
    const currentAccount = accountsById[selectedAccountId] || null
    const accounts = selectOrderedAccounts(accountsById, main.accountOrder)
    const rawBalances = currentAccount?.address ? main.balances?.[currentAccount.address] || [] : []
    const networks = main.networks?.ethereum || {}
    const networksMeta = main.networksMeta?.ethereum || {}
    const rates = main.rates || {}
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
      previousResult.networksMeta === networksMeta
    ) {
      return previousResult
    }

    previousResult = {
      accounts,
      balanceSummaries,
      currentAccount,
      networks,
      networksMeta
    }

    return previousResult
  }
}
