import React from 'react'
import Restore from 'react-restore'
import { v5 as uuidv5 } from 'uuid'

import link from '../../resources/link'
import Native from '../../resources/Native'
import svg from '../../resources/svg'
import { NATIVE_CURRENCY } from '../../resources/constants'
import {
  createBalanceSummarySelector,
  createDisplayBalance,
  type BalanceSummary
} from '../../resources/domain/balance'
import {
  FLASH_BRACKET_ORDER_TYPE,
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
import { resolveFlashAssetFromRouteAssetId } from '../../resources/domain/dappLauncher'
import { formatUnits, toBigInt } from '../../resources/utils/numbers'

const frameOriginId = uuidv5('newframe-internal', uuidv5.DNS)
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

interface TradeProps {
  assetId?: string | null
}

class Trade extends React.Component<TradeProps, any> {
  declare store: Store
  selectBalanceSummaries = createBalanceSummarySelector()
  tradeActionQuoteId = ''
  tradeQuoteRequestKey = ''
  tradeQuoteTimer: any = null

  constructor(props: TradeProps, context?: any) {
    super(props, context)
    const targetAsset = resolveFlashAssetFromRouteAssetId(props.assetId)
    this.state = {
      tradeAdvancedOpen: false,
      tradeContraAsset: getDefaultContraAsset({ targetAsset }),
      tradeContraAmount: '',
      tradeContraOpen: false,
      tradeError: '',
      tradeFlashPayload: null,
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
      tradeTargetAsset: targetAsset,
      tradeTargetAmount: '',
      tradeTargetOpen: false
    }
  }

  override componentDidMount() {
    this.resetTradeFromRouteAsset()
  }

  resetTradeFromRouteAsset() {
    const targetAsset = resolveFlashAssetFromRouteAssetId(this.props.assetId)
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

  override componentWillUnmount() {
    this.clearMarketTradeQuoteTimer()
  }

  getCurrentAccount() {
    const selected = this.store('selected.current')
    return this.store('main.accounts', selected)
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

  override render() {
    return this.renderTradeApp()
  }
}

export default Restore.connect(Trade)
