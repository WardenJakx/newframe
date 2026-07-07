import React from 'react'
import Restore from 'react-restore'
import { isAddress } from 'ethers'
import { v5 as uuidv5 } from 'uuid'

import link from '../../resources/link'
import Native from '../../resources/Native'
import svg from '../../resources/svg'
import { NATIVE_CURRENCY } from '../../resources/constants'
import {
  createBalanceSummarySelector,
  createDisplayBalance,
  formatUsdRate,
  hasPositiveBalance,
  type BalanceSummary
} from '../../resources/domain/balance'
import {
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_DEFAULT_TARGET_ASSET,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_P0_ASSETS,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  getContraPreposition,
  getDefaultContraAsset,
  getDefaultSide,
  getDirectionLabel,
  getReceiveAsset,
  getSpentAsset,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashStep,
  type FlashTradeSide
} from '../../resources/domain/flash'
import { cachedImageUrl } from '../../resources/domain/imageCache'
import { formatUnits, parseUnits, toBigInt } from '../../resources/utils/numbers'

const launcherStorageKey = 'dappLauncher'
const sendStorageKey = 'send'
const tradeStorageKey = 'trade'
const frameOriginId = uuidv5('newframe-internal', uuidv5.DNS)
const INITIAL_SEND_TOKEN_ROWS = 50
const SEND_TOKEN_ROWS_INCREMENT = 50
const TRADE_DEFAULT_SLIPPAGE = '0.50'
const TRADE_LIMIT_ORDER_TYPES: FlashOrderType[] = [
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_BRACKET_ORDER_TYPE
]
const TRADE_ORDER_LABELS: Record<FlashOrderType, string> = {
  [FLASH_MARKET_ORDER_TYPE]: 'Market',
  [FLASH_LIMIT_ORDER_TYPE]: 'Limit',
  [FLASH_TWAP_ORDER_TYPE]: 'TWAP',
  [FLASH_STOP_ORDER_TYPE]: 'Stop',
  [FLASH_STOP_LOSS_ORDER_TYPE]: 'Stop Loss',
  [FLASH_TAKE_PROFIT_ORDER_TYPE]: 'Take Profit',
  [FLASH_BRACKET_ORDER_TYPE]: 'Bracket'
}
const TRADE_VISUAL_USD_RATES: Record<string, number> = {
  ETH: 2400,
  WETH: 2400,
  USDC: 1
}

function tokenKey(token?: any) {
  if (!token) return ''
  return `${token.chainId}:${(token.address || '').toLowerCase()}`
}

function flashAssetKey(asset?: FlashAsset | null) {
  return asset?.id || ''
}

function isSameFlashAsset(a?: FlashAsset | null, b?: FlashAsset | null) {
  return !!a && !!b && (a.id === b.id || a.symbol === b.symbol)
}

function truncateTradeAddress(address = '') {
  if (!address) return ''
  if (address.length <= 12) return address

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function tradeAssetAddressLabel(asset: FlashAsset) {
  if (asset.isNative) return '0xeeeee'

  return truncateTradeAddress(asset.address || '')
}

function flashAssetFromLaunch(asset?: any): FlashAsset | null {
  if (!asset) return null

  const symbol = (asset.symbol || '').toUpperCase()

  return (
    FLASH_P0_ASSETS.find((option) => {
      return option.id === asset.id || option.symbol === symbol
    }) || null
  )
}

function cleanTradeAmount(amount = '') {
  return amount.trim().replace(/,/g, '')
}

function tradeAmountNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatTradeAmount(amount: number, asset: FlashAsset) {
  if (!Number.isFinite(amount) || amount <= 0) return ''

  const decimals = asset.symbol === 'USDC' ? 2 : 6
  return amount
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

function buildVisualTradeSteps(spentAsset: FlashAsset, orderType: FlashOrderType, hasQuote: boolean) {
  const status = hasQuote ? 'required' : 'idle'
  const orderNoun = orderType === FLASH_MARKET_ORDER_TYPE ? 'trade' : 'order'
  const steps: FlashStep[] = []

  if (spentAsset.isNative) {
    steps.push({
      id: 'wrap',
      kind: 'wrap',
      label: `Wrap ${spentAsset.symbol}`,
      status,
      asset: spentAsset
    })
  } else {
    steps.push({
      id: 'approve',
      kind: 'approve',
      label: `Approve ${spentAsset.symbol}`,
      status,
      asset: spentAsset
    })
  }

  steps.push(
    {
      id: 'sign',
      kind: 'sign',
      label: orderType === FLASH_MARKET_ORDER_TYPE ? 'Sign quote' : 'Sign order',
      status
    },
    {
      id: 'submit',
      kind: 'submit',
      label: `Submit ${orderNoun}`,
      status
    }
  )

  return steps
}

// Visual preview remains local for non-market order types until those paths are executable.
function simulateVisualTradeQuote({
  side,
  orderType,
  targetAsset,
  contraAsset,
  inputAmount
}: {
  side: FlashTradeSide
  orderType: FlashOrderType
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  inputAmount: string
}): FlashQuote | null {
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const amount = tradeAmountNumber(inputAmount)

  if (!amount) return null

  const spentUsdRate = TRADE_VISUAL_USD_RATES[spentAsset.symbol] || 1
  const receiveUsdRate = TRADE_VISUAL_USD_RATES[receiveAsset.symbol] || 1
  const outputAmount = (amount * spentUsdRate * 0.9992) / receiveUsdRate
  const output = formatTradeAmount(outputAmount, receiveAsset)
  const rate = formatTradeAmount(spentUsdRate / receiveUsdRate, receiveAsset)

  return {
    id: `${side}-${orderType}-${spentAsset.id}-${receiveAsset.id}-${inputAmount}`,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount,
    outputAmount: output,
    rate: `1 ${spentAsset.symbol} = ${rate || '0'} ${receiveAsset.symbol}`,
    fees: [
      {
        label: 'Visual fee',
        amount: formatTradeAmount(amount * 0.0008, spentAsset),
        asset: spentAsset
      }
    ],
    steps: buildVisualTradeSteps(spentAsset, orderType, true)
  }
}

function objectRecord(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function nestedRecord(value: any, path: string[]) {
  return path.reduce((current, key) => objectRecord(current)[key], value)
}

function tradeErrorMessage(error: any, fallback: string) {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error.message) return error.message
  if (error.error?.message) return error.error.message

  return fallback
}

function providerResponseError(response: any) {
  return response?.error ? tradeErrorMessage(response.error, 'Transaction failed.') : ''
}

function normalizeTradeChainId(chainId: any) {
  const value =
    typeof chainId === 'string'
      ? Number.parseInt(chainId, chainId.toLowerCase().startsWith('0x') ? 16 : 10)
      : Number(chainId)

  if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid Flash chain id')

  return value
}

function tradeChainIdHex(chainId: any) {
  return `0x${normalizeTradeChainId(chainId).toString(16)}`
}

function withTradeStepStatus(
  quote: FlashQuote | null,
  kind: FlashStep['kind'],
  status: FlashStep['status'],
  details: Partial<FlashStep> = {}
) {
  if (!quote) return quote

  return {
    ...quote,
    steps: quote.steps.map((step) => (step.kind === kind ? { ...step, ...details, status } : step))
  }
}

function getFlashOrderTypedData(quote: FlashQuote | null, flashPayload: any) {
  const quoteRaw = objectRecord(quote?.raw)

  return (
    nestedRecord(flashPayload, ['actions', 'evm', 'orderTypedData']) ||
    nestedRecord(flashPayload, ['evm', 'orderTypedData']) ||
    nestedRecord(flashPayload, ['orderTypedData']) ||
    nestedRecord(quoteRaw, ['actions', 'evm', 'orderTypedData']) ||
    nestedRecord(quoteRaw, ['evm', 'orderTypedData']) ||
    nestedRecord(quoteRaw, ['orderTypedData'])
  )
}

function cleanAddress(address = '') {
  return address.trim().toLowerCase()
}

function shouldResolveName(input = '') {
  const value = input.trim()

  return !!value && !/\s/.test(value)
}

function amountHex(amount: bigint) {
  return `0x${amount.toString(16)}`
}

function encodeErc20Transfer(to: string, amount: bigint) {
  const recipient = cleanAddress(to).replace(/^0x/, '').padStart(64, '0')
  const value = amount.toString(16).padStart(64, '0')
  return `0xa9059cbb${recipient}${value}`
}

class App extends React.Component<any, any> {
  declare store: Store
  selectBalanceSummaries = createBalanceSummarySelector()
  tradeActionQuoteId = ''
  tradeQuoteRequestKey = ''
  tradeQuoteTimer: any = null

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      amount: '1',
      error: '',
      recipient: null,
      recipientInput: '',
      recipientOpen: true,
      selectedAssetKey: '',
      launchAssetKey: '',
      launchUpdatedAt: 0,
      status: '',
      submitting: false,
      tradeAdvancedOpen: false,
      tradeContraAsset: getDefaultContraAsset({ targetAsset: FLASH_DEFAULT_TARGET_ASSET }),
      tradeContraAmount: '',
      tradeContraOpen: false,
      tradeError: '',
      tradeFlashPayload: null,
      tradeLaunchAssetKey: '',
      tradeLaunchUpdatedAt: 0,
      tradeOrderType: FLASH_MARKET_ORDER_TYPE,
      tradePendingAction: '',
      tradeQuickTrade: false,
      tradeQuote: null,
      tradeQuoteLoading: false,
      tradeSide: 'sell',
      tradeSignature: '',
      tradeSlippage: TRADE_DEFAULT_SLIPPAGE,
      tradeStatus: '',
      tradeSubmitting: false,
      tradeTargetAsset: FLASH_DEFAULT_TARGET_ASSET,
      tradeTargetAmount: '',
      tradeTargetOpen: false,
      tokenOpen: false,
      tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
    }
  }

  override componentDidMount() {
    this.syncLaunchState()
  }

  override componentDidUpdate() {
    this.syncLaunchState()
  }

  override componentWillUnmount() {
    this.clearMarketTradeQuoteTimer()
  }

  syncLaunchState() {
    this.syncSelectedAssetFromLaunch()
    this.syncTradeFromLaunch()
  }

  syncSelectedAssetFromLaunch() {
    const launchAsset = this.store('main.dapp.storage', sendStorageKey, 'asset')
    const launchUpdatedAt = this.store('main.dapp.storage', sendStorageKey, 'updatedAt') || 0
    const launchAssetKey = tokenKey(launchAsset)

    if (launchUpdatedAt !== this.state.launchUpdatedAt || launchAssetKey !== this.state.launchAssetKey) {
      this.setState({
        launchAssetKey,
        launchUpdatedAt,
        selectedAssetKey: launchAssetKey,
        tokenOpen: false,
        tokenRowsVisible: INITIAL_SEND_TOKEN_ROWS
      })
    }
  }

  syncTradeFromLaunch() {
    const launchAsset = flashAssetFromLaunch(this.store('main.dapp.storage', tradeStorageKey, 'asset'))
    const launchUpdatedAt = this.store('main.dapp.storage', tradeStorageKey, 'updatedAt') || 0
    const launchAssetKey = flashAssetKey(launchAsset)

    if (
      launchUpdatedAt !== this.state.tradeLaunchUpdatedAt ||
      launchAssetKey !== this.state.tradeLaunchAssetKey
    ) {
      const targetAsset = launchAsset || FLASH_DEFAULT_TARGET_ASSET
      const balances = this.getFlashBalanceEntries()
      const side = getDefaultSide({ targetAsset, balances })
      const contraAsset = getDefaultContraAsset({ targetAsset, balances })

      this.setState({
        tradeAdvancedOpen: false,
        tradeContraAsset: isSameFlashAsset(targetAsset, contraAsset)
          ? getDefaultContraAsset({ targetAsset })
          : contraAsset,
        tradeContraAmount: '',
        tradeContraOpen: false,
        tradeError: '',
        tradeFlashPayload: null,
        tradeLaunchAssetKey: launchAssetKey,
        tradeLaunchUpdatedAt: launchUpdatedAt,
        tradeOrderType: FLASH_MARKET_ORDER_TYPE,
        tradePendingAction: '',
        tradeQuote: null,
        tradeQuoteLoading: false,
        tradeSide: side,
        tradeSignature: '',
        tradeStatus: '',
        tradeSubmitting: false,
        tradeTargetAsset: targetAsset,
        tradeTargetAmount: '',
        tradeTargetOpen: false
      })
    }
  }

  getLaunchMode() {
    return this.store('main.dapp.storage', launcherStorageKey, 'mode') === 'trade' ? 'trade' : 'send'
  }

  getCurrentAccount() {
    const selected = this.store('selected.current')
    return this.store('main.accounts', selected)
  }

  getAccounts() {
    const accounts = this.store('main.accounts') || {}
    const order = this.store('main.accountOrder') || Object.keys(accounts)
    const ordered = order.map((id: string) => accounts[id]).filter(Boolean)
    const missing = Object.keys(accounts)
      .filter((id) => !order.includes(id))
      .map((id) => accounts[id])

    return [...ordered, ...missing]
  }

  getBalanceSummaries() {
    const account = this.getCurrentAccount()
    const rawBalances = account ? this.store('main.balances', account.address) || [] : []
    const rates = this.store('main.rates') || {}
    const networks = this.store('main.networks.ethereum') || {}
    const networksMeta = this.store('main.networksMeta.ethereum') || {}

    return this.selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => !!chain.on,
      cacheKey: account?.address || ''
    })
  }

  findTradeBalance(asset: FlashAsset) {
    const balances = this.getBalanceSummaries()

    return balances.find((balance: BalanceSummary) => {
      const symbolMatches = (balance.symbol || '').toUpperCase() === asset.symbol
      const chainMatches = Number(balance.chainId) === asset.chainId
      const nativeMatches = asset.isNative
        ? balance.address === NATIVE_CURRENCY
        : balance.address !== NATIVE_CURRENCY

      return symbolMatches && chainMatches && nativeMatches
    })
  }

  getFlashBalanceEntries() {
    return FLASH_P0_ASSETS.map((asset) => {
      const balance = this.findTradeBalance(asset)

      return {
        id: asset.id,
        assetId: asset.id,
        symbol: asset.symbol,
        balance: balance?.balance || '0'
      }
    })
  }

  getTradeDisplayBalance(asset: FlashAsset) {
    const balance = this.findTradeBalance(asset)
    if (!balance) return '0'

    return createDisplayBalance(balance).displayBalance
  }

  setTradeInputAmount(inputAmount: string, nextState: any = {}) {
    const side = (nextState.tradeSide || this.state.tradeSide) as FlashTradeSide
    const orderType = (nextState.tradeOrderType || this.state.tradeOrderType) as FlashOrderType
    const targetAsset = (nextState.tradeTargetAsset || this.state.tradeTargetAsset) as FlashAsset
    const contraAsset = (nextState.tradeContraAsset || this.state.tradeContraAsset) as FlashAsset

    this.tradeActionQuoteId = ''

    if (orderType === FLASH_MARKET_ORDER_TYPE) {
      this.setState(
        {
          ...nextState,
          tradeContraAmount: side === 'buy' ? inputAmount : '',
          tradeError: '',
          tradeFlashPayload: null,
          tradePendingAction: '',
          tradeQuote: null,
          tradeQuoteLoading: false,
          tradeSignature: '',
          tradeStatus: '',
          tradeSubmitting: false,
          tradeTargetAmount: side === 'sell' ? inputAmount : ''
        },
        () => this.queueMarketTradeQuote()
      )
      return
    }

    const quote = simulateVisualTradeQuote({
      side,
      orderType,
      targetAsset,
      contraAsset,
      inputAmount
    })

    this.clearMarketTradeQuoteTimer()
    this.tradeQuoteRequestKey = ''
    this.setState({
      ...nextState,
      tradeContraAmount: side === 'buy' ? inputAmount : quote?.outputAmount || '',
      tradeError: '',
      tradeFlashPayload: null,
      tradePendingAction: '',
      tradeQuote: quote,
      tradeQuoteLoading: false,
      tradeSignature: '',
      tradeStatus: '',
      tradeSubmitting: false,
      tradeTargetAmount: side === 'sell' ? inputAmount : quote?.outputAmount || ''
    })
  }

  clearMarketTradeQuoteTimer() {
    if (this.tradeQuoteTimer) clearTimeout(this.tradeQuoteTimer)
    this.tradeQuoteTimer = null
  }

  getTradeInputAmount() {
    return this.state.tradeSide === 'buy' ? this.state.tradeContraAmount : this.state.tradeTargetAmount
  }

  getMarketTradeOptionalFields() {
    const optionalFields: any = {}
    const slippage = String(this.state.tradeSlippage || '').trim()

    if (this.state.tradeQuickTrade) optionalFields.quickTrade = true
    if (slippage && slippage !== TRADE_DEFAULT_SLIPPAGE) optionalFields.slippage = slippage

    return optionalFields
  }

  buildMarketTradeQuoteRequest() {
    const account = this.getCurrentAccount()
    const side = this.state.tradeSide as FlashTradeSide
    const targetAsset = this.state.tradeTargetAsset as FlashAsset
    const contraAsset = this.state.tradeContraAsset as FlashAsset
    const inputAmount = cleanTradeAmount(this.getTradeInputAmount())

    if (!tradeAmountNumber(inputAmount)) return null
    if (!account?.address) throw new Error('Select an account to trade.')

    const chainId = targetAsset.chainId || contraAsset.chainId

    return {
      accountAddress: account.address,
      chainId,
      contraAsset,
      contraChain: chainId,
      inputAmount,
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: inputAmount,
      side,
      targetAsset,
      targetChain: chainId,
      ...this.getMarketTradeOptionalFields()
    }
  }

  marketTradeQuoteRequestKey(request: any) {
    return JSON.stringify([
      request.accountAddress,
      request.chainId,
      request.side,
      request.orderType,
      request.targetAsset?.id,
      request.contraAsset?.id,
      request.qty,
      request.slippage,
      request.quickTrade
    ])
  }

  queueMarketTradeQuote() {
    this.clearMarketTradeQuoteTimer()

    if (this.state.tradeOrderType !== FLASH_MARKET_ORDER_TYPE) return

    let request: any = null

    try {
      request = this.buildMarketTradeQuoteRequest()
    } catch (e) {
      this.tradeQuoteRequestKey = ''
      this.setState({
        tradeError: tradeErrorMessage(e, 'Could not build Flash quote.'),
        tradeFlashPayload: null,
        tradePendingAction: '',
        tradeQuote: null,
        tradeQuoteLoading: false,
        tradeStatus: ''
      })
      return
    }

    if (!request) {
      this.tradeQuoteRequestKey = ''
      this.setState({
        tradeError: '',
        tradeFlashPayload: null,
        tradePendingAction: '',
        tradeQuote: null,
        tradeQuoteLoading: false,
        tradeStatus: ''
      })
      return
    }

    const requestKey = this.marketTradeQuoteRequestKey(request)

    this.tradeQuoteRequestKey = requestKey
    this.setState({
      tradeError: '',
      tradeFlashPayload: null,
      tradePendingAction: 'quote',
      tradeQuoteLoading: true,
      tradeSignature: '',
      tradeStatus: 'Getting quote'
    })

    this.tradeQuoteTimer = setTimeout(() => this.fetchMarketTradeQuote(requestKey, request), 250)
  }

  fetchMarketTradeQuote(requestKey: string, request: any) {
    link.rpc('flashQuote', request, (err: any, result: any) => {
      if (this.tradeQuoteRequestKey !== requestKey) return

      if (err) {
        this.setState({
          tradeError: tradeErrorMessage(err, 'Flash quote failed.'),
          tradeFlashPayload: null,
          tradePendingAction: '',
          tradeQuote: null,
          tradeQuoteLoading: false,
          tradeStatus: ''
        })
        return
      }

      const quote = result?.quote as FlashQuote | null

      if (!quote) {
        this.setState({
          tradeError: 'Flash quote did not return a market quote.',
          tradeFlashPayload: null,
          tradePendingAction: '',
          tradeQuote: null,
          tradeQuoteLoading: false,
          tradeStatus: ''
        })
        return
      }

      this.setState({
        tradeContraAmount: quote.side === 'buy' ? quote.inputAmount : quote.outputAmount,
        tradeError: '',
        tradeFlashPayload: result?.flash || quote.raw || null,
        tradePendingAction: '',
        tradeQuote: quote,
        tradeQuoteLoading: false,
        tradeSignature: '',
        tradeStatus: '',
        tradeTargetAmount: quote.side === 'sell' ? quote.inputAmount : quote.outputAmount
      })
    })
  }

  refreshMarketQuoteForSettings(nextState: any) {
    this.setState(
      {
        ...nextState,
        tradeError: '',
        tradeStatus: ''
      },
      () => {
        if (this.state.tradeOrderType === FLASH_MARKET_ORDER_TYPE) this.queueMarketTradeQuote()
      }
    )
  }

  selectTradeAsset(field: 'target' | 'contra', asset: FlashAsset) {
    const targetAsset = field === 'target' ? asset : (this.state.tradeTargetAsset as FlashAsset)
    let contraAsset = field === 'contra' ? asset : (this.state.tradeContraAsset as FlashAsset)

    if (isSameFlashAsset(targetAsset, contraAsset)) {
      const replacement = getDefaultContraAsset({ targetAsset })
      contraAsset = isSameFlashAsset(targetAsset, replacement)
        ? FLASH_P0_ASSETS.find((option) => !isSameFlashAsset(option, targetAsset)) || contraAsset
        : replacement
    }

    const side = this.state.tradeSide as FlashTradeSide
    const inputAmount = side === 'buy' ? this.state.tradeContraAmount : this.state.tradeTargetAmount

    this.setTradeInputAmount(inputAmount, {
      tradeContraAsset: contraAsset,
      tradeContraOpen: false,
      tradeTargetAsset: targetAsset,
      tradeTargetOpen: false
    })
  }

  setTradeOrderType(orderType: FlashOrderType) {
    const side = this.state.tradeSide as FlashTradeSide
    const inputAmount = side === 'buy' ? this.state.tradeContraAmount : this.state.tradeTargetAmount

    this.setTradeInputAmount(inputAmount, {
      tradeOrderType: orderType
    })
  }

  toggleTradeSide() {
    const nextSide: FlashTradeSide = this.state.tradeSide === 'buy' ? 'sell' : 'buy'
    const inputAmount = this.state.tradeQuote?.outputAmount || ''

    this.setTradeInputAmount(inputAmount, {
      tradeSide: nextSide
    })
  }

  setTradeBalanceAmount(asset: FlashAsset, portion: 'half' | 'max') {
    const balance = this.findTradeBalance(asset)
    const rawBalance = toBigInt(balance?.balance || 0) || 0n
    const amount = portion === 'half' ? rawBalance / 2n : rawBalance

    this.setTradeInputAmount(formatUnits(amount, asset.decimals))
  }

  getTradeSpentAsset() {
    return getSpentAsset({
      side: this.state.tradeSide,
      targetAsset: this.state.tradeTargetAsset,
      contraAsset: this.state.tradeContraAsset
    })
  }

  getTradeSteps() {
    const spentAsset = this.getTradeSpentAsset()
    const quote = this.state.tradeQuote as FlashQuote | null

    return quote?.steps || buildVisualTradeSteps(spentAsset, this.state.tradeOrderType, false)
  }

  getTradeStepStatus(kind: FlashStep['kind']) {
    const quote = this.state.tradeQuote as FlashQuote | null

    return quote?.steps.find((step) => step.kind === kind)?.status || ''
  }

  getNextTradeAction() {
    const quote = this.state.tradeQuote as FlashQuote | null

    if (this.state.tradeOrderType !== FLASH_MARKET_ORDER_TYPE || !quote) return ''
    if (quote.actions?.wrap && this.getTradeStepStatus('wrap') !== 'complete') return 'wrap'
    if (quote.actions?.approval && this.getTradeStepStatus('approve') !== 'complete') return 'approve'
    if (this.getTradeStepStatus('sign') !== 'complete') return 'sign'

    return ''
  }

  getTradePrimaryLabel() {
    if (this.state.tradeOrderType !== FLASH_MARKET_ORDER_TYPE) return 'Unavailable in visual preview'
    if (this.state.tradeSubmitting || this.state.tradePendingAction === 'submit') return 'Submitting'
    if (this.state.tradeQuoteLoading || this.state.tradePendingAction === 'quote') return 'Getting quote'

    const quote = this.state.tradeQuote as FlashQuote | null
    const action = this.state.tradePendingAction || this.getNextTradeAction()

    if (action === 'wrap') return quote?.actions?.wrap?.label || 'Wrap'
    if (action === 'approve') return quote?.actions?.approval?.label || 'Approve'
    if (action === 'sign') return 'Review/sign'

    return quote ? 'Review/sign' : 'Enter amount'
  }

  canReviewTrade() {
    return (
      this.state.tradeOrderType === FLASH_MARKET_ORDER_TYPE &&
      !!this.state.tradeQuote &&
      !!this.getNextTradeAction() &&
      !this.state.tradePendingAction &&
      !this.state.tradeQuoteLoading &&
      !this.state.tradeSubmitting
    )
  }

  reviewTrade() {
    if (!this.canReviewTrade()) return

    const quote = this.state.tradeQuote as FlashQuote
    const nextAction = this.getNextTradeAction()

    if (nextAction === 'wrap') return this.sendTradeTransaction(quote.actions?.wrap)
    if (nextAction === 'approve') return this.sendTradeTransaction(quote.actions?.approval)
    if (nextAction === 'sign') return this.signAndSubmitTrade()
  }

  setTradeStepStatus(kind: FlashStep['kind'], status: FlashStep['status'], details: Partial<FlashStep> = {}) {
    this.setState((previous: any) => ({
      tradeQuote: withTradeStepStatus(previous.tradeQuote, kind, status, details)
    }))
  }

  sendTradeTransaction(action: any) {
    const account = this.getCurrentAccount()
    const quote = this.state.tradeQuote as FlashQuote | null
    const actionQuoteId = quote?.id || ''
    const tx = action?.tx
    const stepKind: FlashStep['kind'] = action?.kind === 'wrap' ? 'wrap' : 'approve'

    if (!account?.address || !tx?.to) {
      const message = 'Flash action is missing a transaction request.'

      this.setTradeStepStatus(stepKind, 'error', { error: message })
      this.setState({ tradeError: message, tradePendingAction: '', tradeStatus: '' })
      return
    }

    let chainIdNumber: number
    let chainId: string

    try {
      chainIdNumber = normalizeTradeChainId(tx.chainId)
      chainId = tradeChainIdHex(tx.chainId)
    } catch (e) {
      const message = tradeErrorMessage(e, 'Invalid Flash transaction chain.')

      this.setTradeStepStatus(stepKind, 'error', { error: message })
      this.setState({ tradeError: message, tradePendingAction: '', tradeStatus: '' })
      return
    }

    link.send('tray:action', 'initOrigin', frameOriginId, {
      name: 'newframe-internal',
      chain: { id: chainIdNumber, type: 'ethereum' }
    })

    const payload = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      chainId,
      params: [
        {
          ...tx,
          chainId,
          from: tx.from || account.address,
          value: tx.value || '0x0'
        }
      ],
      _origin: frameOriginId
    }

    this.setState((previous: any) => ({
      tradeError: '',
      tradePendingAction: stepKind,
      tradeQuote: withTradeStepStatus(previous.tradeQuote, stepKind, 'pending', { error: undefined }),
      tradeStatus: 'Confirm in Newframe'
    }))
    this.tradeActionQuoteId = actionQuoteId

    link.rpc('providerSend', payload, (response: any) => {
      if (this.tradeActionQuoteId !== actionQuoteId) return

      const error = providerResponseError(response)

      if (error) {
        this.setState((previous: any) => ({
          tradeError: error,
          tradePendingAction: '',
          tradeQuote: withTradeStepStatus(previous.tradeQuote, stepKind, 'error', { error }),
          tradeStatus: ''
        }))
        return
      }

      this.setState((previous: any) => ({
        tradeError: '',
        tradePendingAction: '',
        tradeQuote: withTradeStepStatus(previous.tradeQuote, stepKind, 'complete', {
          error: undefined,
          txHash: response?.result
        }),
        tradeStatus: ''
      }))
    })
  }

  signAndSubmitTrade() {
    const account = this.getCurrentAccount()
    const quote = this.state.tradeQuote as FlashQuote | null
    const actionQuoteId = quote?.id || ''
    const typedData = getFlashOrderTypedData(quote, this.state.tradeFlashPayload)

    if (!account?.address || !quote || !typedData) {
      const message = 'Flash quote is missing order typed data.'

      this.setTradeStepStatus('sign', 'error', { error: message })
      this.setState({ tradeError: message, tradePendingAction: '', tradeStatus: '' })
      return
    }

    let chainIdNumber: number
    let chainId: string

    try {
      chainIdNumber = normalizeTradeChainId(
        objectRecord(typedData).domain?.chainId || quote.targetAsset.chainId
      )
      chainId = tradeChainIdHex(chainIdNumber)
    } catch (e) {
      const message = tradeErrorMessage(e, 'Invalid Flash signature chain.')

      this.setTradeStepStatus('sign', 'error', { error: message })
      this.setState({ tradeError: message, tradePendingAction: '', tradeStatus: '' })
      return
    }

    link.send('tray:action', 'initOrigin', frameOriginId, {
      name: 'newframe-internal',
      chain: { id: chainIdNumber, type: 'ethereum' }
    })

    const payload = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'eth_signTypedData_v4',
      chainId,
      params: [account.address, JSON.stringify(typedData)],
      _origin: frameOriginId
    }

    this.setState((previous: any) => ({
      tradeError: '',
      tradePendingAction: 'sign',
      tradeQuote: withTradeStepStatus(previous.tradeQuote, 'sign', 'pending', { error: undefined }),
      tradeStatus: 'Review signature in Newframe'
    }))
    this.tradeActionQuoteId = actionQuoteId

    link.rpc('providerSend', payload, (response: any) => {
      if (this.tradeActionQuoteId !== actionQuoteId) return

      const error = providerResponseError(response)
      const signature = response?.result

      if (error || !signature) {
        const message = error || 'Order signature was not returned.'

        this.setState((previous: any) => ({
          tradeError: message,
          tradePendingAction: '',
          tradeQuote: withTradeStepStatus(previous.tradeQuote, 'sign', 'error', { error: message }),
          tradeStatus: ''
        }))
        return
      }

      this.setState(
        (previous: any) => ({
          tradeError: '',
          tradePendingAction: '',
          tradeQuote: withTradeStepStatus(previous.tradeQuote, 'sign', 'complete', { error: undefined }),
          tradeSignature: signature,
          tradeStatus: ''
        }),
        () => this.submitSignedTrade(signature)
      )
    })
  }

  submitSignedTrade(signature: string) {
    const account = this.getCurrentAccount()
    const quote = this.state.tradeQuote as FlashQuote | null

    if (!account?.address || !quote) {
      const message = 'Flash quote is no longer available.'

      this.setTradeStepStatus('submit', 'error', { error: message })
      this.setState({ tradeError: message, tradePendingAction: '', tradeStatus: '', tradeSubmitting: false })
      return
    }

    const chainId = quote.targetAsset.chainId || quote.contraAsset.chainId
    const flashPayload = this.state.tradeFlashPayload || quote.raw || null
    const submitRequest = {
      accountAddress: account.address,
      chainId,
      contraAsset: quote.contraAsset,
      contraChain: chainId,
      inputAmount: quote.inputAmount,
      orderSignature: signature,
      orderType: quote.orderType,
      qty: quote.inputAmount,
      quote,
      quoteId: quote.id || objectRecord(flashPayload).quoteId,
      rawPayload: flashPayload,
      side: quote.side,
      signature,
      targetAsset: quote.targetAsset,
      targetChain: chainId,
      ...this.getMarketTradeOptionalFields()
    }

    this.setState((previous: any) => ({
      tradeError: '',
      tradePendingAction: 'submit',
      tradeQuote: withTradeStepStatus(previous.tradeQuote, 'submit', 'pending', { error: undefined }),
      tradeStatus: 'Submitting order',
      tradeSubmitting: true
    }))

    link.rpc('flashSubmitOrder', submitRequest, (err: any, result: any) => {
      if (err || !result?.orderId) {
        const message = err
          ? tradeErrorMessage(err, 'Flash order submit failed.')
          : 'Flash order submit did not return an order id.'

        this.setState((previous: any) => ({
          tradeError: message,
          tradePendingAction: '',
          tradeQuote: withTradeStepStatus(
            withTradeStepStatus(previous.tradeQuote, 'submit', 'error', { error: message }),
            'sign',
            'required',
            { error: undefined }
          ),
          tradeSignature: '',
          tradeStatus: '',
          tradeSubmitting: false
        }))
        return
      }

      this.setState(
        (previous: any) => ({
          tradeError: '',
          tradePendingAction: '',
          tradeQuote: withTradeStepStatus(previous.tradeQuote, 'submit', 'complete', { error: undefined }),
          tradeStatus: '',
          tradeSubmitting: false
        }),
        () => link.send('frame:close')
      )
    })
  }

  chainColor(chainId: number) {
    const primaryColor = this.store('main.networksMeta.ethereum', chainId, 'primaryColor')
    return primaryColor ? `var(--${primaryColor})` : 'var(--moon)'
  }

  chainIcon(chainId: number, imgSize = 16, glyphSize = 12, dotSize = 9) {
    const icon = this.store('main.networksMeta.ethereum', chainId, 'icon')
    if (icon) {
      return (
        <img src={cachedImageUrl(icon)} alt='' style={{ width: `${imgSize}px`, height: `${imgSize}px` }} />
      )
    }

    const chain = this.store('main.networks.ethereum', chainId) || {}
    const ethChains = ['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']
    if (ethChains.includes((chain.name || '').toLowerCase())) return svg.eth(glyphSize)

    return (
      <div
        className='sendChainIconDot'
        style={{ background: this.chainColor(chainId), width: `${dotSize}px`, height: `${dotSize}px` }}
      />
    )
  }

  getSelectedAsset() {
    const balances = this.getBalanceSummaries()
    const launchAsset = this.store('main.dapp.storage', sendStorageKey, 'asset')
    const fallbackKey = tokenKey(launchAsset)
    const selectedKey = this.state.selectedAssetKey || fallbackKey

    const selectedBalance = balances.find((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
    if (selectedBalance) return createDisplayBalance(selectedBalance)
    if (launchAsset && tokenKey(launchAsset) === selectedKey && hasPositiveBalance(launchAsset))
      return launchAsset

    return balances[0] ? createDisplayBalance(balances[0]) : null
  }

  getAmountBaseUnits(asset: any) {
    return parseUnits(this.state.amount, asset?.decimals || 18)
  }

  getRecipientAddress() {
    const selectedRecipient = this.state.recipient?.address || ''
    const input = this.state.recipientInput.trim()

    if (selectedRecipient) return cleanAddress(selectedRecipient)
    if (isAddress(input)) return cleanAddress(input)

    return ''
  }

  resolveName(name: string) {
    return new Promise<string>((resolve, reject) => {
      link.rpc('resolveName', name, (err: any, address: string) => {
        if (err || !address) reject(err || new Error('Could not resolve name'))
        else resolve(cleanAddress(address))
      })
    })
  }

  async resolveRecipientAddress() {
    const address = this.getRecipientAddress()
    if (address) return address

    const input = this.state.recipientInput.trim()
    if (shouldResolveName(input)) {
      return this.resolveName(input)
    }

    return ''
  }

  selectRecipient(account: any) {
    this.setState({
      error: '',
      recipient: account,
      recipientInput: '',
      recipientOpen: false
    })
  }

  clearRecipient() {
    this.setState({
      recipient: null,
      recipientInput: '',
      recipientOpen: true
    })
  }

  selectAsset(asset: any) {
    this.setState({
      error: '',
      selectedAssetKey: tokenKey(asset),
      tokenOpen: false
    })
  }

  setMax(asset: any) {
    const rawBalance = toBigInt(asset.balance) || 0n
    this.setState({ amount: formatUnits(rawBalance, asset.decimals), error: '' })
  }

  canProceed(asset: any) {
    const amount = asset && this.getAmountBaseUnits(asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n
    const hasRecipient = !!this.getRecipientAddress() || shouldResolveName(this.state.recipientInput)

    return !!asset && hasRecipient && !!amount && amount > 0n && amount <= balance
  }

  async submit() {
    const account = this.getCurrentAccount()
    const asset = this.getSelectedAsset()
    const amount = this.getAmountBaseUnits(asset)
    const balance = asset ? toBigInt(asset.balance) || 0n : 0n

    if (!account || !asset || !amount || amount <= 0n) {
      return this.setState({ error: 'Enter an amount to send.' })
    }

    if (amount > balance) {
      return this.setState({ error: 'Amount exceeds available balance.' })
    }

    let recipientAddress: string

    try {
      recipientAddress = await this.resolveRecipientAddress()
    } catch (e) {
      return this.setState({ error: 'Could not resolve recipient.' })
    }

    if (!isAddress(recipientAddress)) {
      return this.setState({ error: 'Enter a valid recipient.' })
    }

    const chainId = `0x${asset.chainId.toString(16)}`
    const nativeTransfer = asset.address === NATIVE_CURRENCY
    const tx = nativeTransfer
      ? {
          from: account.address,
          to: recipientAddress,
          value: amountHex(amount),
          chainId
        }
      : {
          from: account.address,
          to: asset.address,
          value: '0x0',
          data: encodeErc20Transfer(recipientAddress, amount),
          chainId
        }

    link.send('tray:action', 'initOrigin', frameOriginId, {
      name: 'newframe-internal',
      chain: { id: asset.chainId, type: 'ethereum' }
    })

    const payload = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      chainId,
      params: [tx],
      _origin: frameOriginId
    }

    this.setState({ error: '', status: 'Confirm in Newframe', submitting: true })

    link.rpc('providerSend', payload, (response: any) => {
      if (response?.error) {
        this.setState({
          error: response.error.message || 'Transaction failed.',
          status: '',
          submitting: false
        })
      } else {
        this.setState({ status: 'Transaction submitted', submitting: false })
      }
    })
  }

  signerIcon(type: string, size = 16) {
    const signerType = (type || '').toLowerCase()
    if (signerType === 'address') return svg.eye(size)
    if (signerType === 'ledger') return svg.ledger(size)
    if (signerType === 'trezor') return svg.trezor(size)
    if (signerType === 'lattice') return svg.lattice(size)
    return svg.flame(size + 2)
  }

  renderAccountIcon(account: any) {
    return <div className='sendAccountIcon'>{this.signerIcon(account?.lastSignerType)}</div>
  }

  renderRecipient() {
    const accounts = this.getAccounts()
    const recipient = this.state.recipient

    if (recipient) {
      return (
        <div className='sendCard sendRecipientCard sendRecipientCardSelected'>
          <div className='sendSectionTitle'>Add recipient</div>
          <div className='sendRecipientPill'>
            {this.renderAccountIcon(recipient)}
            <div className='sendRecipientText'>
              <div className='sendRecipientName'>{recipient.ensName || recipient.name}</div>
              <div className='sendRecipientAddress'>{recipient.address}</div>
            </div>
            <div className='sendRecipientCopy'>{svg.copy(14)}</div>
            <button
              aria-label='Clear recipient'
              className='sendRecipientClear'
              onClick={() => this.clearRecipient()}
            >
              {svg.x(14)}
            </button>
          </div>
          <div className='sendRecipientNotice'>First time sending to this address.</div>
        </div>
      )
    }

    return (
      <div className='sendCard sendRecipientCard'>
        <div className='sendSectionTitle'>Add recipient</div>
        <div className='sendInputRow'>
          <input
            aria-label='Recipient'
            placeholder='Address / gns/ens name / Namoshi'
            spellCheck='false'
            value={this.state.recipientInput}
            onChange={(e) =>
              this.setState({
                error: '',
                recipientInput: e.target.value,
                recipientOpen: true
              })
            }
          />
          <button
            aria-label='Toggle recipients'
            className='sendInputToggle'
            onClick={() => this.setState({ recipientOpen: !this.state.recipientOpen })}
          >
            {svg.chevron(14)}
          </button>
        </div>
        {this.state.recipientOpen ? (
          <div className='sendRecipientMenu'>
            <div className='sendRecipientMenuTitle'>{svg.wallet(14)} My wallets</div>
            {accounts.map((account: any) => (
              <button
                className='sendWalletRow'
                key={account.id}
                onClick={() => this.selectRecipient(account)}
                type='button'
              >
                {this.renderAccountIcon(account)}
                <div className='sendWalletInfo'>
                  <div className='sendWalletName'>{account.ensName || account.name}</div>
                  <div className='sendWalletAddress'>{account.address}</div>
                </div>
                <div className='sendWalletCopy'>{svg.copy(14)}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  renderTokenIcon(asset: any) {
    return (
      <div className='sendTokenIcon'>
        <div className='sendTokenIconInner'>
          {asset?.logoURI ? (
            <img src={cachedImageUrl(asset.logoURI)} alt='' />
          ) : (
            <span className='sendTokenIconGlyph'>{(asset?.symbol || '?').substring(0, 1)}</span>
          )}
        </div>
        <div className='sendTokenChainBadge'>{this.chainIcon(asset?.chainId, 18, 11, 9)}</div>
      </div>
    )
  }

  renderTokenSelector(asset: any) {
    const balances = this.state.tokenOpen ? this.getBalanceSummaries() : []
    const selectedKey = tokenKey(asset)
    const visibleBalances = balances.slice(0, this.state.tokenRowsVisible)
    const selectedBalance = balances.find((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
    const menuBalances =
      selectedBalance && !visibleBalances.some((balance: BalanceSummary) => tokenKey(balance) === selectedKey)
        ? [selectedBalance, ...visibleBalances]
        : visibleBalances
    const rowsHidden = Math.max(balances.length - this.state.tokenRowsVisible, 0)

    return (
      <div className='sendTokenPicker'>
        <button
          className='sendTokenButton'
          onClick={() => this.setState({ tokenOpen: !this.state.tokenOpen, recipientOpen: false })}
        >
          {this.renderTokenIcon(asset)}
          <div className='sendTokenText'>
            <div className='sendTokenSymbol'>{asset?.symbol || 'Token'}</div>
            <div className='sendTokenChain'>
              {this.store('main.networks.ethereum', asset?.chainId, 'name') || ''}
            </div>
          </div>
          <div className='sendTokenChevron'>{svg.chevron(13)}</div>
        </button>
        {this.state.tokenOpen ? (
          <div className='sendTokenMenu'>
            {menuBalances.map((balance: BalanceSummary) => {
              const displayBalance = createDisplayBalance(balance)

              return (
                <button
                  key={tokenKey(balance)}
                  className='sendTokenOption'
                  onClick={() => this.selectAsset(displayBalance)}
                >
                  {this.renderTokenIcon(displayBalance)}
                  <div className='sendTokenText'>
                    <div className='sendTokenSymbol'>{displayBalance.symbol}</div>
                    <div className='sendTokenChain'>
                      {this.store('main.networks.ethereum', displayBalance.chainId, 'name')}
                    </div>
                  </div>
                  <div className='sendTokenOptionBalance'>{displayBalance.displayBalance}</div>
                </button>
              )
            })}
            {rowsHidden > 0 ? (
              <button
                className='sendTokenMore'
                onClick={() =>
                  this.setState({
                    tokenRowsVisible: this.state.tokenRowsVisible + SEND_TOKEN_ROWS_INCREMENT
                  })
                }
              >
                {`Show ${Math.min(SEND_TOKEN_ROWS_INCREMENT, rowsHidden)} more assets`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  renderTokenAmount(asset: any) {
    const amount = Number(this.state.amount || 0)
    const price = Number(asset?.usdRate?.price || 0)
    const fiatValue = amount > 0 && price > 0 ? `$${formatUsdRate(amount * price, 2)}` : '$0.00'

    return (
      <div className='sendCard sendTokenCard'>
        <div className='sendSectionTitle'>Send token</div>
        <div className='sendTokenMain'>
          {this.renderTokenSelector(asset)}
          <input
            aria-label='Amount'
            className='sendAmountInput'
            inputMode='decimal'
            spellCheck='false'
            value={this.state.amount}
            onChange={(e) => this.setState({ amount: e.target.value, error: '', status: '' })}
          />
        </div>
        <div className='sendTokenMeta'>
          <div className='sendBalance'>
            {svg.wallet(13)}
            <span>
              {asset?.displayBalance || '0'} {asset?.symbol || ''}
            </span>
            <button onClick={() => this.setMax(asset)}>Max</button>
          </div>
          <div className='sendFiatValue'>{fiatValue}</div>
        </div>
      </div>
    )
  }

  renderFooter(asset: any) {
    const enabled = this.canProceed(asset) && !this.state.submitting

    return (
      <div className='sendFooter'>
        <button
          className={enabled ? 'sendProceedButton' : 'sendProceedButton sendProceedButtonDisabled'}
          disabled={!enabled}
          onClick={() => this.submit()}
        >
          Proceed
        </button>
      </div>
    )
  }

  renderTradeTabs() {
    const orderType = this.state.tradeOrderType as FlashOrderType
    const activeTab =
      orderType === FLASH_MARKET_ORDER_TYPE
        ? 'market'
        : orderType === FLASH_TWAP_ORDER_TYPE
          ? 'twap'
          : 'limit'

    return (
      <div className='tradeTabsWrap'>
        <div aria-label='Order type' className='tradeTabs' role='tablist'>
          <button
            aria-selected={activeTab === 'market'}
            className={activeTab === 'market' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => this.setTradeOrderType(FLASH_MARKET_ORDER_TYPE)}
            role='tab'
            type='button'
          >
            Market
          </button>
          <button
            aria-selected={activeTab === 'limit'}
            className={activeTab === 'limit' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => this.setTradeOrderType(FLASH_LIMIT_ORDER_TYPE)}
            role='tab'
            type='button'
          >
            Limit
          </button>
          <button
            aria-selected={activeTab === 'twap'}
            className={activeTab === 'twap' ? 'tradeTab tradeTabActive' : 'tradeTab'}
            onClick={() => this.setTradeOrderType(FLASH_TWAP_ORDER_TYPE)}
            role='tab'
            type='button'
          >
            TWAP
          </button>
        </div>
        {activeTab === 'limit' ? (
          <div className='tradeLimitSelectRow'>
            <select
              aria-label='Limit order type'
              className='tradeLimitSelect'
              onChange={(e) => this.setTradeOrderType(e.target.value as FlashOrderType)}
              value={orderType}
            >
              {TRADE_LIMIT_ORDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRADE_ORDER_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    )
  }

  renderTradeAssetIcon(asset: FlashAsset) {
    return (
      <div className={`tradeAssetIcon tradeAssetIcon${asset.symbol}`}>
        {asset.symbol === 'USDC' ? svg.usd(16) : svg.eth(16)}
      </div>
    )
  }

  renderTradeAssetSelector(field: 'target' | 'contra', asset: FlashAsset, oppositeAsset: FlashAsset) {
    const open = field === 'target' ? this.state.tradeTargetOpen : this.state.tradeContraOpen
    const openKey = field === 'target' ? 'tradeTargetOpen' : 'tradeContraOpen'
    const otherOpenKey = field === 'target' ? 'tradeContraOpen' : 'tradeTargetOpen'
    const options = FLASH_P0_ASSETS.filter((option) => !isSameFlashAsset(option, oppositeAsset))

    return (
      <div className='tradeAssetSelector'>
        <button
          aria-label={`Select ${field} asset ${asset.symbol}`}
          className='tradeAssetButton'
          onClick={() => this.setState({ [openKey]: !open, [otherOpenKey]: false })}
          type='button'
        >
          {this.renderTradeAssetIcon(asset)}
          <span>{asset.symbol}</span>
          <div className='tradeAssetChevron'>{svg.chevron(11)}</div>
        </button>
        {open ? (
          <div className='tradeAssetMenu'>
            {options.map((option) => {
              const balance = this.getTradeDisplayBalance(option)
              const address = tradeAssetAddressLabel(option)

              return (
                <button
                  aria-label={`Choose ${field} asset ${option.symbol} ${option.name} ${address} balance ${balance}`}
                  className='tradeAssetOption'
                  key={option.id}
                  onClick={() => this.selectTradeAsset(field, option)}
                  type='button'
                >
                  {this.renderTradeAssetIcon(option)}
                  <div className='tradeAssetOptionText'>
                    <span>{option.symbol}</span>
                    <small>{option.name}</small>
                    <small>{address}</small>
                  </div>
                  <div className='tradeAssetOptionBalance'>
                    <span>{balance}</span>
                    <small>{option.symbol}</small>
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  renderTradeDirectionSwitch() {
    const side = this.state.tradeSide as FlashTradeSide
    const nextSide = side === 'buy' ? 'SELL' : 'BUY'

    return (
      <button
        aria-label={`Switch to ${nextSide}`}
        className='tradeDirectionSwitch'
        onClick={() => this.toggleTradeSide()}
        title={`Switch to ${nextSide}`}
        type='button'
      >
        <svg aria-hidden='true' viewBox='0 0 20 20'>
          <path d='M4 5.5h10.2l-2-2L13.7 2 18 6.25l-4.3 4.25-1.5-1.5 2-2H4z' />
          <path d='M16 14.5H5.8l2 2L6.3 18 2 13.75 6.3 9.5 7.8 11l-2 2H16z' />
        </svg>
      </button>
    )
  }

  renderTradeBalanceControls(asset: FlashAsset) {
    return (
      <div className='tradeBalanceControls'>
        <div className='tradeBalanceText'>
          Balance {this.getTradeDisplayBalance(asset)} {asset.symbol}
        </div>
        <div className='tradeBalanceButtons'>
          <button onClick={() => this.setTradeBalanceAmount(asset, 'half')} type='button'>
            HALF
          </button>
          <button onClick={() => this.setTradeBalanceAmount(asset, 'max')} type='button'>
            MAX
          </button>
        </div>
      </div>
    )
  }

  renderTradeAssetCard(field: 'target' | 'contra') {
    const side = this.state.tradeSide as FlashTradeSide
    const targetAsset = this.state.tradeTargetAsset as FlashAsset
    const contraAsset = this.state.tradeContraAsset as FlashAsset
    const asset = field === 'target' ? targetAsset : contraAsset
    const oppositeAsset = field === 'target' ? contraAsset : targetAsset
    const amount = field === 'target' ? this.state.tradeTargetAmount : this.state.tradeContraAmount
    const isTarget = field === 'target'
    const editable = side === 'buy' ? field === 'contra' : field === 'target'
    const intent = isTarget ? getDirectionLabel(side) : getContraPreposition(side).toUpperCase()
    const intentClass = isTarget
      ? side === 'buy'
        ? 'tradeIntentLine tradeIntentBuy'
        : 'tradeIntentLine tradeIntentSell'
      : 'tradeIntentLine'

    return (
      <div className={editable ? 'tradeAssetCard tradeAssetCardEditable' : 'tradeAssetCard'}>
        <div className='tradeAssetCardHeader'>
          <div className={intentClass}>
            <span>{intent}</span>
            {isTarget ? this.renderTradeDirectionSwitch() : null}
          </div>
        </div>
        <div className='tradeAssetAmountRow'>
          {this.renderTradeAssetSelector(field, asset, oppositeAsset)}
          <input
            aria-label={editable ? `${asset.symbol} amount` : `Estimated ${asset.symbol} received`}
            className='tradeAmountInput'
            inputMode='decimal'
            onChange={editable ? (e) => this.setTradeInputAmount(e.target.value) : undefined}
            placeholder='0'
            readOnly={!editable}
            spellCheck='false'
            value={amount}
          />
        </div>
        {editable ? (
          this.renderTradeBalanceControls(asset)
        ) : (
          <div className='tradeOutputNote'>Est. received</div>
        )}
      </div>
    )
  }

  renderTradeQuoteMeta() {
    const quote = this.state.tradeQuote as FlashQuote | null
    if (!quote) return null

    const fee = quote.fees?.[0]

    return (
      <div className='tradeQuoteMeta'>
        <span>{quote.rate}</span>
        {fee ? (
          <span>
            {fee.label} {fee.amount} {fee.asset?.symbol}
          </span>
        ) : null}
      </div>
    )
  }

  renderTradeSteps() {
    return (
      <div className='tradeStepTracker'>
        {this.getTradeSteps().map((step: FlashStep, index: number) => (
          <div className={`tradeStep tradeStep${step.status}`} key={step.id}>
            <div className='tradeStepDot'>{index + 1}</div>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    )
  }

  renderTradeAdvanced() {
    const isMarket = this.state.tradeOrderType === FLASH_MARKET_ORDER_TYPE

    return (
      <div className='tradeAdvanced'>
        <button
          className='tradeAdvancedToggle'
          onClick={() => this.setState({ tradeAdvancedOpen: !this.state.tradeAdvancedOpen })}
          type='button'
        >
          <span>{svg.settings(13)}</span>
          <span>Advanced</span>
          <div
            className={
              this.state.tradeAdvancedOpen
                ? 'tradeAdvancedChevron tradeAdvancedChevronOpen'
                : 'tradeAdvancedChevron'
            }
          >
            {svg.chevron(11)}
          </div>
        </button>
        {this.state.tradeAdvancedOpen ? (
          <div className='tradeAdvancedPanel'>
            <label className='tradeSettingRow'>
              <span>Slippage</span>
              <div className='tradeSlippageInput'>
                <input
                  aria-label='Slippage'
                  inputMode='decimal'
                  onChange={(e) => this.refreshMarketQuoteForSettings({ tradeSlippage: e.target.value })}
                  value={this.state.tradeSlippage}
                />
                <span>%</span>
              </div>
            </label>
            {isMarket ? (
              <label className='tradeSettingRow tradeCheckRow'>
                <span>quickTrade</span>
                <input
                  checked={this.state.tradeQuickTrade}
                  onChange={(e) => this.refreshMarketQuoteForSettings({ tradeQuickTrade: e.target.checked })}
                  type='checkbox'
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  renderTradeFooter() {
    const enabled = this.canReviewTrade()

    return (
      <div className='tradeFooter'>
        <button
          className={enabled ? 'tradePrimaryButton' : 'tradePrimaryButton tradePrimaryButtonDisabled'}
          disabled={!enabled}
          onClick={() => this.reviewTrade()}
          type='button'
        >
          {this.getTradePrimaryLabel()}
        </button>
      </div>
    )
  }

  renderTradeApp() {
    return (
      <div className='tradeApp'>
        <Native />
        <div className='sendHeader'>
          <button
            aria-label='Close Trade'
            className='sendBackButton'
            onClick={() => link.send('frame:close')}
          >
            {svg.chevronLeft(18)}
          </button>
          <div className='sendTitle'>Trade</div>
          <div className='sendHeaderSpacer' />
        </div>
        <div className='tradeBody'>
          <div className='tradeTicket'>
            {this.renderTradeTabs()}
            {this.renderTradeAssetCard('target')}
            {this.renderTradeAssetCard('contra')}
          </div>
          {this.renderTradeQuoteMeta()}
          {this.renderTradeAdvanced()}
          {this.state.tradeError ? (
            <div className='sendMessage sendMessageError'>{this.state.tradeError}</div>
          ) : null}
          {this.state.tradeStatus ? <div className='sendMessage'>{this.state.tradeStatus}</div> : null}
          {this.renderTradeSteps()}
        </div>
        {this.renderTradeFooter()}
      </div>
    )
  }

  renderSendApp() {
    const asset = this.getSelectedAsset()
    const hasAsset = !!asset

    return (
      <div className='sendApp'>
        <Native />
        <div className='sendHeader'>
          <button aria-label='Close Send' className='sendBackButton' onClick={() => link.send('frame:close')}>
            {svg.chevronLeft(18)}
          </button>
          <div className='sendTitle'>Send</div>
          <div className='sendHeaderSpacer' />
        </div>
        {hasAsset ? (
          <div className='sendBody'>
            {this.renderRecipient()}
            {this.renderTokenAmount(asset)}
            {this.state.error ? <div className='sendMessage sendMessageError'>{this.state.error}</div> : null}
            {this.state.status ? <div className='sendMessage'>{this.state.status}</div> : null}
          </div>
        ) : (
          <div className='sendEmpty'>No assets available to send.</div>
        )}
        {hasAsset ? this.renderFooter(asset) : null}
      </div>
    )
  }

  override render() {
    return this.getLaunchMode() === 'trade' ? this.renderTradeApp() : this.renderSendApp()
  }
}

export default Restore.connect(App)
