import { NATIVE_CURRENCY } from '../../constants'

export const FLASH_ANVIL_CHAIN_ID = 31337
export const FLASH_BASE_CHAIN_ID = 8453

export const FLASH_NATIVE_ETH_TOKEN_ADDRESS = NATIVE_CURRENCY
export const FLASH_WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const FLASH_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const FLASH_BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const FLASH_BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export const FLASH_NATIVE_ETH_ASSET_SYMBOL = 'ETH'
export const FLASH_WETH_ASSET_SYMBOL = 'WETH'
export const FLASH_USDC_ASSET_SYMBOL = 'USDC'

export const FLASH_MARKET_ORDER_TYPE = 'market'
export const FLASH_LIMIT_ORDER_TYPE = 'limit'
export const FLASH_TWAP_ORDER_TYPE = 'twap'
export const FLASH_STOP_ORDER_TYPE = 'stop'
export const FLASH_STOP_LOSS_ORDER_TYPE = 'stop-loss'
export const FLASH_TAKE_PROFIT_ORDER_TYPE = 'take-profit'
export const FLASH_BRACKET_ORDER_TYPE = 'bracket'

export const FLASH_TRADE_SIDES = ['buy', 'sell'] as const
export type FlashTradeSide = (typeof FLASH_TRADE_SIDES)[number]

export type FlashOrderType =
  | typeof FLASH_MARKET_ORDER_TYPE
  | typeof FLASH_LIMIT_ORDER_TYPE
  | typeof FLASH_TWAP_ORDER_TYPE
  | typeof FLASH_STOP_ORDER_TYPE
  | typeof FLASH_STOP_LOSS_ORDER_TYPE
  | typeof FLASH_TAKE_PROFIT_ORDER_TYPE
  | typeof FLASH_BRACKET_ORDER_TYPE

export type FlashAssetId = string
export type FlashAssetSymbol = string

export interface FlashAsset {
  id: FlashAssetId
  symbol: FlashAssetSymbol
  name: string
  decimals: number
  chainId: number
  isNative: boolean
  address?: string
}

export type FlashStepKind = 'wrap' | 'approve' | 'sign' | 'submit'
export type FlashStepStatus = 'idle' | 'required' | 'pending' | 'complete' | 'error' | 'skipped'

export interface FlashStep {
  id: string
  kind: FlashStepKind
  label: string
  status: FlashStepStatus
  asset?: FlashAsset
  amount?: string
  txHash?: string
  error?: string
}

export interface FlashQuoteFee {
  label: string
  amount: string
  asset?: FlashAsset
}

export type FlashQuoteActionKind = 'wrap' | 'approve'

export interface FlashQuoteTransactionRequest {
  chainId: number
  from?: string
  to: string
  data: string
  value?: string
}

export interface FlashQuoteAction {
  id: string
  kind: FlashQuoteActionKind
  label: string
  asset: FlashAsset
  amount: string
  amountRaw: string
  spender?: string
  tx: FlashQuoteTransactionRequest
}

export interface FlashQuoteActions {
  wrap?: FlashQuoteAction | null
  approval?: FlashQuoteAction | null
}

export interface FlashQuote {
  id?: string
  side: FlashTradeSide
  orderType: FlashOrderType
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  spentAsset: FlashAsset
  receiveAsset: FlashAsset
  inputAmount: string
  outputAmount: string
  rate?: string
  fees?: FlashQuoteFee[]
  steps: FlashStep[]
  actions?: FlashQuoteActions
  expiresAt?: string
  raw?: unknown
}

export type FlashBalanceValue = string | number | bigint | null | undefined

export interface FlashAssetBalance {
  id?: string
  assetId?: string
  symbol?: string
  balance?: FlashBalanceValue
}

export type FlashAssetBalanceEntry = FlashBalanceValue | FlashAssetBalance
export type FlashAssetBalanceMap = Record<string, FlashAssetBalanceEntry | undefined>
export type FlashAssetBalances = FlashAssetBalanceMap | readonly FlashAssetBalance[]

export interface FlashAssetPair {
  side: FlashTradeSide
  targetAsset: FlashAsset
  contraAsset: FlashAsset
}

export type FlashAmountField = 'target' | 'contra'

export interface FlashAmountState {
  asset: FlashAsset
  amount: string
  field: FlashAmountField
  editable: boolean
}

export interface FlashTicketState {
  side: FlashTradeSide
  orderType: FlashOrderType
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  targetAmount: string
  contraAmount: string
}

export interface FlashDefaultAssetOptions {
  assets?: readonly FlashAsset[]
  targetAsset: FlashAsset
  balances?: FlashAssetBalances | null
}

export interface FlashRuntime {
  environment?: string | null
  isDev?: boolean | null
  profile?: string | null
}

interface FlashBalanceSummaryLike {
  address?: unknown
  balance?: FlashBalanceValue
  chainId?: unknown
  decimals?: unknown
  name?: unknown
  symbol?: unknown
}

const FLASH_DEV_SUPPORTED_CHAIN_IDS = [FLASH_ANVIL_CHAIN_ID] as const
const FLASH_PROD_SUPPORTED_CHAIN_IDS = [1, 10, 56, 137, 999, 8453, 9745, 81457, 42161, 43114, 143] as const

const FLASH_CHAIN_SLUGS: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bsc',
  137: 'polygon',
  999: 'hyperevm',
  8453: 'base',
  9745: 'plasma',
  81457: 'blast',
  42161: 'arbitrum',
  43114: 'avalanche',
  143: 'monad',
  [FLASH_ANVIL_CHAIN_ID]: 'anvil'
}

const FLASH_TOKEN_ADDRESSES: Record<number, { weth?: string; usdc?: string }> = {
  [FLASH_ANVIL_CHAIN_ID]: {
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  },
  1: {
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  },
  [FLASH_BASE_CHAIN_ID]: {
    weth: FLASH_BASE_WETH_ADDRESS,
    usdc: FLASH_BASE_USDC_ADDRESS
  }
}

export function flashAssetId(chainId: number, address: string) {
  return `${chainId}:${normalizeFlashAddress(address)}`
}

export const FLASH_NATIVE_ETH_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_NATIVE_ETH_TOKEN_ADDRESS)
export const FLASH_WETH_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_WETH_ADDRESS)
export const FLASH_USDC_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ADDRESS)

export const FLASH_NATIVE_ETH_ASSET = {
  id: FLASH_NATIVE_ETH_ASSET_ID,
  symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL,
  name: 'Ether',
  decimals: 18,
  chainId: FLASH_ANVIL_CHAIN_ID,
  isNative: true,
  address: FLASH_NATIVE_ETH_TOKEN_ADDRESS
} as const satisfies FlashAsset

export const FLASH_WETH_ASSET = {
  id: FLASH_WETH_ASSET_ID,
  symbol: FLASH_WETH_ASSET_SYMBOL,
  name: 'Wrapped Ether',
  decimals: 18,
  chainId: FLASH_ANVIL_CHAIN_ID,
  isNative: false,
  address: FLASH_WETH_ADDRESS
} as const satisfies FlashAsset

export const FLASH_USDC_ASSET = {
  id: FLASH_USDC_ASSET_ID,
  symbol: FLASH_USDC_ASSET_SYMBOL,
  name: 'USD Coin',
  decimals: 6,
  chainId: FLASH_ANVIL_CHAIN_ID,
  isNative: false,
  address: FLASH_USDC_ADDRESS
} as const satisfies FlashAsset

export const FLASH_DEFAULT_TARGET_ASSET = FLASH_WETH_ASSET

function isDevFlashRuntime(runtime: FlashRuntime = {}) {
  return runtime.profile === 'dev' || runtime.isDev === true || runtime.environment === 'development'
}

function normalizeFlashAddress(address?: unknown) {
  const value = typeof address === 'string' ? address.trim().toLowerCase() : ''

  return /^0x[0-9a-f]{40}$/.test(value) ? value : FLASH_NATIVE_ETH_TOKEN_ADDRESS
}

function createFlashAsset({
  address,
  chainId,
  decimals,
  isNative,
  name,
  symbol
}: {
  address: string
  chainId: number
  decimals: number
  isNative: boolean
  name: string
  symbol: string
}): FlashAsset {
  const normalizedAddress = normalizeFlashAddress(address)

  return {
    id: flashAssetId(chainId, normalizedAddress),
    symbol,
    name,
    decimals,
    chainId,
    isNative,
    address: normalizedAddress
  }
}

export function getFlashSupportedChainIds(runtime: FlashRuntime = {}): number[] {
  return isDevFlashRuntime(runtime) ? [...FLASH_DEV_SUPPORTED_CHAIN_IDS] : [...FLASH_PROD_SUPPORTED_CHAIN_IDS]
}

export function isFlashChainSupported(chainId: number, runtime: FlashRuntime = {}) {
  return getFlashSupportedChainIds(runtime).includes(Number(chainId))
}

export function getFlashChainSlug(chainId: number) {
  return FLASH_CHAIN_SLUGS[Number(chainId)] || ''
}

export function getFlashDefaultChainId(runtime: FlashRuntime = {}, availableChainIds?: readonly number[]) {
  const supported = getFlashSupportedChainIds(runtime)
  const available = (availableChainIds || [])
    .map((chainId) => Number(chainId))
    .filter((chainId) => Number.isInteger(chainId) && supported.includes(chainId))

  return available[0] || supported[0] || FLASH_ANVIL_CHAIN_ID
}

export function toFlashApiAssetAddress(asset: FlashAsset) {
  return asset.isNative ? FLASH_NATIVE_ETH_TOKEN_ADDRESS : normalizeFlashAddress(asset.address)
}

export function balanceSummaryToFlashAsset(balance: FlashBalanceSummaryLike): FlashAsset {
  const chainId = Number(balance.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error('Invalid Flash balance chain id')

  const address = normalizeFlashAddress(balance.address)
  const isNative = address === FLASH_NATIVE_ETH_TOKEN_ADDRESS
  const symbol = String(balance.symbol || (isNative ? FLASH_NATIVE_ETH_ASSET_SYMBOL : '')).trim()

  if (!symbol) throw new Error('Invalid Flash balance symbol')

  const decimals = Number(balance.decimals)

  return createFlashAsset({
    address,
    chainId,
    decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : isNative ? 18 : 18,
    isNative,
    name: String(balance.name || symbol),
    symbol
  })
}

export function getFlashAssetsForChain(chainId: number): FlashAsset[] {
  const normalizedChainId = Number(chainId)
  const addresses = FLASH_TOKEN_ADDRESSES[normalizedChainId]

  if (!addresses) {
    return [
      createFlashAsset({
        address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
        chainId: normalizedChainId,
        decimals: 18,
        isNative: true,
        name: 'Native Asset',
        symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
      })
    ]
  }

  return [
    createFlashAsset({
      address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: true,
      name: 'Ether',
      symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: addresses.weth || FLASH_WETH_ADDRESS,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: false,
      name: 'Wrapped Ether',
      symbol: FLASH_WETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: addresses.usdc || FLASH_USDC_ADDRESS,
      chainId: normalizedChainId,
      decimals: 6,
      isNative: false,
      name: 'USD Coin',
      symbol: FLASH_USDC_ASSET_SYMBOL
    })
  ]
}

export function getFlashDefaultTargetAsset(chainId = FLASH_ANVIL_CHAIN_ID) {
  return (
    getFlashAssetsForChain(chainId).find((asset) => asset.symbol === FLASH_WETH_ASSET_SYMBOL) ||
    getFlashAssetsForChain(chainId)[0] || {
      ...FLASH_DEFAULT_TARGET_ASSET,
      chainId,
      id: flashAssetId(chainId, toFlashApiAssetAddress(FLASH_DEFAULT_TARGET_ASSET))
    }
  )
}

function getFlashDefaultContraAssetPriority(chainId: number) {
  const assets = getFlashAssetsForChain(chainId)
  const usdc = assets.find((asset) => asset.symbol === FLASH_USDC_ASSET_SYMBOL)
  const weth = assets.find((asset) => asset.symbol === FLASH_WETH_ASSET_SYMBOL)
  const nativeEth = assets.find((asset) => asset.isNative)

  return [usdc, weth, nativeEth].filter(Boolean) as FlashAsset[]
}

export function getSpentAsset({ side, targetAsset, contraAsset }: FlashAssetPair): FlashAsset {
  return side === 'buy' ? contraAsset : targetAsset
}

export function getReceiveAsset({ side, targetAsset, contraAsset }: FlashAssetPair): FlashAsset {
  return side === 'buy' ? targetAsset : contraAsset
}

export function getDirectionLabel(side: FlashTradeSide): 'BUY' | 'SELL' {
  return side === 'buy' ? 'BUY' : 'SELL'
}

export function getContraPreposition(side: FlashTradeSide): 'with' | 'for' {
  return side === 'buy' ? 'with' : 'for'
}

export function formatPairIntent({ side, targetAsset, contraAsset }: FlashAssetPair): string {
  return `${targetAsset.symbol} ${side === 'buy' ? '<-' : '->'} ${contraAsset.symbol}`
}

export function getDefaultContraAsset({
  assets,
  targetAsset,
  balances
}: FlashDefaultAssetOptions): FlashAsset {
  const sameChainOptions = sortContraCandidates(
    (assets || getFlashDefaultContraAssetPriority(targetAsset.chainId)).filter(
      (asset) => asset.chainId === targetAsset.chainId && !isSameFlashAsset(asset, targetAsset)
    )
  )
  const candidates = sameChainOptions.length
    ? sameChainOptions
    : getFlashDefaultContraAssetPriority(targetAsset.chainId).filter(
        (asset) => !isSameFlashAsset(asset, targetAsset)
      )

  return (
    candidates.find((asset) => hasAssetBalance(asset, balances)) ||
    candidates[0] ||
    getFlashDefaultContraAssetPriority(FLASH_ANVIL_CHAIN_ID)[0]
  )
}

function sortContraCandidates(assets: FlashAsset[]) {
  const priority = (asset: FlashAsset) => {
    if (asset.symbol.toUpperCase() === FLASH_USDC_ASSET_SYMBOL) return 0
    if (asset.symbol.toUpperCase() === FLASH_WETH_ASSET_SYMBOL) return 1
    if (asset.isNative) return 2
    return 3
  }

  return [...assets].sort((a, b) => priority(a) - priority(b))
}

export function getDefaultSide({ targetAsset, balances }: FlashDefaultAssetOptions): FlashTradeSide {
  if (!balances) return 'sell'

  return hasAssetBalance(targetAsset, balances) ? 'sell' : 'buy'
}

function isSameFlashAsset(a: FlashAsset, b: FlashAsset) {
  return (
    a.id === b.id ||
    (a.chainId === b.chainId &&
      normalizeFlashAddress(toFlashApiAssetAddress(a)) ===
        normalizeFlashAddress(toFlashApiAssetAddress(b))) ||
    (a.chainId === b.chainId && a.symbol.toUpperCase() === b.symbol.toUpperCase())
  )
}

function hasAssetBalance(asset: FlashAsset, balances?: FlashAssetBalances | null) {
  return hasBalanceValue(getAssetBalanceValue(asset, balances))
}

function getAssetBalanceValue(asset: FlashAsset, balances?: FlashAssetBalances | null): FlashBalanceValue {
  if (!balances) return undefined

  if (Array.isArray(balances)) {
    return balances.find((balance) => isAssetBalanceForAsset(balance, asset))?.balance
  }

  const balanceMap = balances as FlashAssetBalanceMap

  for (const key of [asset.id, asset.symbol, asset.symbol.toLowerCase()]) {
    const value = getBalanceValue(balanceMap[key])

    if (value !== undefined && value !== null) return value
  }

  return undefined
}

function isAssetBalanceForAsset(balance: FlashAssetBalance, asset: FlashAsset) {
  return (
    balance.assetId === asset.id ||
    balance.id === asset.id ||
    balance.symbol?.toUpperCase() === asset.symbol.toUpperCase()
  )
}

function getBalanceValue(entry: FlashAssetBalanceEntry | undefined): FlashBalanceValue {
  if (entry && typeof entry === 'object') return entry.balance

  return entry
}

function hasBalanceValue(value: FlashBalanceValue) {
  if (value === undefined || value === null) return false
  if (typeof value === 'bigint') return value > 0n
  if (typeof value === 'number') return Number.isFinite(value) && value > 0

  const normalized = value.trim().replace(/,/g, '')

  if (!normalized) return false

  if (/^0x[0-9a-f]+$/i.test(normalized)) return BigInt(normalized) > 0n
  if (/^-?\d+$/.test(normalized)) return BigInt(normalized) > 0n

  const parsed = Number(normalized)

  return Number.isFinite(parsed) && parsed > 0
}
