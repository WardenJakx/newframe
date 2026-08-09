import { signerTypeLabel } from '../../../shared/renderer/ui/signerPresentation'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import { createBalanceSummarySelector, formatUsdRate } from '../../asset-data/domain/balance'

export type AccountProjection = WalletRendererState['accounts'][string]
export type SignerProjection = WalletRendererState['signers'][string]
export type ProfileProjection = WalletRendererState['profiles'][number]

type BalanceSummarySelector = ReturnType<typeof createBalanceSummarySelector>

export interface AccountListItem {
  id: string
  address: string
  displayName: string
  shortAddress: string
  signerType: string
  signerLabel: string
  balanceLabel: string
  agentEnabled: boolean
  hot: boolean
  lastSeedAccount: boolean
  profileId: string
}

export interface AccountListModel {
  currentAccountId: string
  items: AccountListItem[]
  profiles: ProfileProjection[]
}

function accountDisplayName(account: AccountProjection | undefined, showLocalNameWithENS: boolean) {
  if (!account) return ''
  return account.ensName && !showLocalNameWithENS ? account.ensName : account.name
}

export function shortAccountAddress(address = '') {
  return address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''
}

function accountSignerType(account: AccountProjection | undefined) {
  return String(account?.lastSignerType || '')
}

function accountSignerLabel(account: AccountProjection | undefined) {
  return signerTypeLabel(accountSignerType(account))
}

function isHotAccount(account: AccountProjection | undefined) {
  return ['ring', 'seed'].includes(accountSignerType(account).toLowerCase())
}

export function orderedAccountIds(
  accounts: Record<string, AccountProjection>,
  projectedOrder: readonly string[]
) {
  const createdOrder = Object.keys(accounts).sort((left, right) => {
    const leftCreated = String(accounts[left]?.created || '')
    const rightCreated = String(accounts[right]?.created || '')
    return leftCreated.localeCompare(rightCreated)
  })
  const ordered = projectedOrder.filter((id) => Boolean(accounts[id]))
  for (const id of createdOrder) if (!ordered.includes(id)) ordered.push(id)
  return ordered
}

export function accountMatchesQuery(item: AccountListItem, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const text = [item.displayName, item.address, item.shortAddress, item.signerLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return normalized.split(/\s+/).every((part) => text.includes(part))
}

function isLastAccountForSeedPhrase(
  account: AccountProjection,
  accounts: Record<string, AccountProjection>,
  signers: Record<string, SignerProjection>
) {
  if (accountSignerType(account).toLowerCase() !== 'seed' || !account.signer) return false
  const signer = signers[account.signer]
  if (signer?.type !== 'seed') return false
  return !Object.values(accounts).some(
    (candidate) => candidate.id !== account.id && candidate.signer === signer.id
  )
}

export function accountBalanceLabel(input: {
  account: AccountProjection
  assetRates: WalletRendererState['assetRates']
  balances: WalletRendererState['balances']
  networks: WalletRendererState['networks']['ethereum']
  networksMeta: WalletRendererState['networksMeta']['ethereum']
  selectBalanceSummaries: BalanceSummarySelector
  showTestnets: boolean
  tokens: WalletRendererState['tokens']
}) {
  const rawBalances = input.balances[input.account.address]
  if (!Array.isArray(rawBalances) || rawBalances.length === 0) return '---'
  const balances = input.selectBalanceSummaries({
    rawBalances,
    assetRates: input.assetRates,
    tokens: input.tokens,
    networks: input.networks,
    networksMeta: input.networksMeta,
    includeChain: (chain) => (!chain.isTestnet || input.showTestnets) && Boolean(chain.on),
    cacheKey: `${input.account.address}:${input.showTestnets ? 'testnets' : 'mainnets'}`
  })
  if (balances.length > 0 && !balances.some((balance) => balance.hasPrice)) return '—'
  const total = balances.reduce((sum, balance) => sum + balance.totalValue, 0)
  return `$${formatUsdRate(total, 2)}`
}

export function buildAccountListModel(input: {
  accountOrder: readonly string[]
  accounts: Record<string, AccountProjection>
  assetRates: WalletRendererState['assetRates']
  balances: WalletRendererState['balances']
  currentAccountId: string
  networks: WalletRendererState['networks']['ethereum']
  networksMeta: WalletRendererState['networksMeta']['ethereum']
  profiles: ProfileProjection[]
  query: string
  selectBalanceSummaries: BalanceSummarySelector
  showLocalNameWithENS: boolean
  showTestnets: boolean
  signers: Record<string, SignerProjection>
  tokens: WalletRendererState['tokens']
}): AccountListModel {
  const items = orderedAccountIds(input.accounts, input.accountOrder).map((id): AccountListItem => {
    const account = input.accounts[id]
    return {
      id,
      address: account.address,
      displayName: accountDisplayName(account, input.showLocalNameWithENS),
      shortAddress: shortAccountAddress(account.address),
      signerType: accountSignerType(account),
      signerLabel: accountSignerLabel(account),
      balanceLabel: accountBalanceLabel({ ...input, account }),
      agentEnabled: Boolean(account.agentEnabled),
      hot: isHotAccount(account),
      lastSeedAccount: isLastAccountForSeedPhrase(account, input.accounts, input.signers),
      profileId: account.profileId
    }
  })
  return {
    currentAccountId: input.currentAccountId,
    items: items.filter((item) => accountMatchesQuery(item, input.query)),
    profiles: input.profiles
  }
}
