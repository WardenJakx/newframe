export const FLASH_ANVIL_CHAIN_ID = 31337
export const FLASH_BASE_CHAIN_ID = 8453

export const FLASH_NATIVE_ETH_ASSET_ID = 'native-eth'
export const FLASH_WETH_ASSET_ID = 'weth'
export const FLASH_USDC_ASSET_ID = 'usdc'

export const FLASH_NATIVE_ETH_ASSET_SYMBOL = 'ETH'
export const FLASH_WETH_ASSET_SYMBOL = 'WETH'
export const FLASH_USDC_ASSET_SYMBOL = 'USDC'

export const FLASH_NATIVE_ETH_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'
export const FLASH_WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const FLASH_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const FLASH_BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const FLASH_BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export const FLASH_MOCK_SETTLEMENT_ADDRESS = '0x0000000000000000000000000000000000005e77'

export const FLASH_MARKET_ORDER_TYPE = 'market'
export const FLASH_LIMIT_ORDER_TYPE = 'limit'
export const FLASH_TWAP_ORDER_TYPE = 'twap'
export const FLASH_STOP_ORDER_TYPE = 'stop'
export const FLASH_STOP_LOSS_ORDER_TYPE = 'stop-loss'
export const FLASH_TAKE_PROFIT_ORDER_TYPE = 'take-profit'
export const FLASH_BRACKET_ORDER_TYPE = 'bracket'

export const FLASH_TRADE_SIDES = ['buy', 'sell'] as const
export type FlashTradeSide = (typeof FLASH_TRADE_SIDES)[number]

export const FLASH_P0_ORDER_TYPES = [
  FLASH_MARKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_BRACKET_ORDER_TYPE
] as const
export type FlashOrderType = (typeof FLASH_P0_ORDER_TYPES)[number]

export type FlashAssetId =
  | typeof FLASH_NATIVE_ETH_ASSET_ID
  | typeof FLASH_WETH_ASSET_ID
  | typeof FLASH_USDC_ASSET_ID

export type FlashAssetSymbol =
  | typeof FLASH_NATIVE_ETH_ASSET_SYMBOL
  | typeof FLASH_WETH_ASSET_SYMBOL
  | typeof FLASH_USDC_ASSET_SYMBOL

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

export type FlashQuoteStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface FlashQuoteState {
  status: FlashQuoteStatus
  quote: FlashQuote | null
  error: string | null
}

export interface FlashDefaultAssetOptions {
  targetAsset: FlashAsset
  balances?: FlashAssetBalances | null
}

export interface FlashRuntime {
  environment?: string | null
  isDev?: boolean | null
  profile?: string | null
}

export const FLASH_NATIVE_ETH_ASSET = {
  id: FLASH_NATIVE_ETH_ASSET_ID,
  symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL,
  name: 'Ether',
  decimals: 18,
  chainId: FLASH_ANVIL_CHAIN_ID,
  isNative: true
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

export const FLASH_P0_ASSETS = [FLASH_NATIVE_ETH_ASSET, FLASH_WETH_ASSET, FLASH_USDC_ASSET] as const
export const FLASH_DEFAULT_TARGET_ASSET = FLASH_WETH_ASSET

const FLASH_TOKEN_ADDRESSES: Record<number, { weth: string; usdc: string }> = {
  [FLASH_ANVIL_CHAIN_ID]: {
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  },
  [FLASH_BASE_CHAIN_ID]: {
    weth: FLASH_BASE_WETH_ADDRESS,
    usdc: FLASH_BASE_USDC_ADDRESS
  }
}

export function getFlashDefaultChainId(runtime: FlashRuntime = {}) {
  if (runtime.isDev || runtime.profile === 'dev' || runtime.environment === 'development') {
    return FLASH_ANVIL_CHAIN_ID
  }

  return FLASH_BASE_CHAIN_ID
}

export function isFlashChainSupported(chainId: number, runtime: FlashRuntime = {}) {
  return chainId === getFlashDefaultChainId(runtime)
}

export function getFlashAssetsForChain(chainId: number): FlashAsset[] {
  const supportedChainId = FLASH_TOKEN_ADDRESSES[chainId] ? chainId : FLASH_ANVIL_CHAIN_ID
  if (supportedChainId === FLASH_ANVIL_CHAIN_ID) return [...FLASH_P0_ASSETS]

  const addresses = FLASH_TOKEN_ADDRESSES[supportedChainId]

  return [
    {
      ...FLASH_NATIVE_ETH_ASSET,
      chainId: supportedChainId
    },
    {
      ...FLASH_WETH_ASSET,
      address: addresses.weth,
      chainId: supportedChainId
    },
    {
      ...FLASH_USDC_ASSET,
      address: addresses.usdc,
      chainId: supportedChainId
    }
  ]
}

export function getFlashDefaultTargetAsset(chainId = FLASH_ANVIL_CHAIN_ID) {
  return (
    getFlashAssetsForChain(chainId).find((asset) => asset.id === FLASH_WETH_ASSET_ID) || {
      ...FLASH_DEFAULT_TARGET_ASSET,
      chainId
    }
  )
}

function getFlashDefaultContraAssetPriority(chainId: number) {
  const assets = getFlashAssetsForChain(chainId)
  const usdc = assets.find((asset) => asset.id === FLASH_USDC_ASSET_ID)
  const weth = assets.find((asset) => asset.id === FLASH_WETH_ASSET_ID)
  const nativeEth = assets.find((asset) => asset.id === FLASH_NATIVE_ETH_ASSET_ID)

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

export function getDefaultContraAsset({ targetAsset, balances }: FlashDefaultAssetOptions): FlashAsset {
  const candidates = getFlashDefaultContraAssetPriority(targetAsset.chainId).filter(
    (asset) => !isSameFlashAsset(asset, targetAsset)
  )

  return (
    candidates.find((asset) => hasAssetBalance(asset, balances)) ||
    candidates[0] ||
    getFlashDefaultContraAssetPriority(FLASH_ANVIL_CHAIN_ID)[0]
  )
}

export function getDefaultSide({ targetAsset, balances }: FlashDefaultAssetOptions): FlashTradeSide {
  if (!balances) return 'sell'

  return hasAssetBalance(targetAsset, balances) ? 'sell' : 'buy'
}

function isSameFlashAsset(a: FlashAsset, b: FlashAsset) {
  return a.id === b.id || a.symbol === b.symbol
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
    balance.assetId === asset.id || balance.id === asset.id || balance.symbol?.toUpperCase() === asset.symbol
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
