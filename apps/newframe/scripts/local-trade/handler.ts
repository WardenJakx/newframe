import { Interface, JsonRpcProvider, MaxUint256, Wallet, getAddress, isAddress, parseUnits } from 'ethers'

import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../resources/domain/flash/constants'
import {
  FLASH_NATIVE_ETH_ASSET,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET,
  toFlashApiAssetAddress
} from '../../resources/domain/flash/assets'
import { getReceiveAsset, getSpentAsset } from '../../resources/domain/flash/pair'
import {
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashStep,
  type FlashTradeSide
} from '../../resources/domain/flash/schemas'

type LocalOrderStatus = 'accepted' | 'filled' | 'cancelled' | 'rejected'

interface LocalQuoteRecord {
  body: Record<string, any>
  quote: FlashQuote
  response: Record<string, any>
}

interface LocalOrderRecord {
  accountAddress: string
  cancellable: boolean
  chain: string
  chainId: number
  createdAt: string
  fillTransactionHash?: string | null
  filledOutputAmount?: string | null
  open: boolean
  orderId: string
  orderType: FlashOrderType
  quote: FlashQuote
  quoteId: string
  rawError?: string | null
  side: FlashTradeSide
  status: LocalOrderStatus
  updatedAt: string
}

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || process.env.FLASH_ANVIL_RPC_URL || 'http://127.0.0.1:8545'
const GAS_PAYER_PRIVATE_KEY =
  process.env.FLASH_ANVIL_GAS_PAYER_PRIVATE_KEY ||
  process.env.ANVIL_DEPLOYER_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const MARKET_FILL_DELAY_MS = 3_000
const LOCAL_CHAIN_SLUG = 'anvil'
const LOCAL_MOCK_FLASH_SETTLEMENT_ADDRESS = '0x0000000000000000000000000000000000005e77'
const MIN_TWAP_DURATION_SECONDS = 300
const MAX_TWAP_DURATION_SECONDS = 2_592_000
const MIN_TWAP_BUCKET_COUNT = 2
const MAX_TWAP_BUCKET_COUNT = 2_560

type LocalTrigger = {
  notionalPrice: string
  triggerType: 'lower' | 'upper'
}

class LocalTradeValidationError extends Error {}

const quotes = new Map<string, LocalQuoteRecord>()
const orders = new Map<string, LocalOrderRecord>()
const orderListeners = new Set<(order: Record<string, any>) => void>()

export function subscribeLocalTradeOrders(listener: (order: Record<string, any>) => void) {
  orderListeners.add(listener)
  return () => orderListeners.delete(listener)
}

export function localOpenOrderSnapshot(funderAddress: string) {
  const funder = funderAddress.trim().toLowerCase()

  return Array.from(orders.values())
    .filter((order) => order.open && order.accountAddress.toLowerCase() === funder)
    .map(orderResponse)
}

function persistOrder(order: LocalOrderRecord) {
  orders.set(order.orderId, order)
  const payload = orderResponse(order)

  for (const listener of orderListeners) {
    try {
      listener(payload)
    } catch (error) {
      console.warn('[local-trade] order listener failed', error)
    }
  }

  return order
}

const erc20Interface = new Interface([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
])
const wethInterface = new Interface(['function deposit() payable'])
const settlementInterface = new Interface([
  'function swapExactInput(address payer,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount) returns (uint256)'
])

const mockUsdRates: Record<string, number> = {
  ETH: 2400,
  WETH: 2400,
  USDC: 1
}

function provider() {
  return new JsonRpcProvider(ANVIL_RPC_URL, FLASH_ANVIL_CHAIN_ID)
}

function wallet() {
  return new Wallet(GAS_PAYER_PRIVATE_KEY, provider())
}

function nowIso() {
  return new Date().toISOString()
}

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers || {})
    }
  })
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error)

  return jsonResponse({ error: message, message }, status)
}

function validationError(message: string): never {
  throw new LocalTradeValidationError(message)
}

async function readJson(req: Request) {
  try {
    return objectRecord(await req.json())
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function cleanAmount(amount: unknown) {
  return String(amount || '')
    .trim()
    .replace(/,/g, '')
}

function amountNumber(amount: unknown) {
  const parsed = Number(cleanAmount(amount))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function cleanOptionalAmount(amount: unknown, label: string) {
  if (amount === undefined || amount === null || amount === '') return ''

  const clean = cleanAmount(amount)
  if (!amountNumber(clean)) validationError(`Local Flash ${label} must be a positive decimal`)

  return clean
}

function optionalProtection(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return undefined

  const clean = cleanAmount(value)
  const parsed = Number(clean)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    validationError(`Local Flash ${label} must be a decimal from 0 to 1`)
  }

  return clean
}

function optionalExpireTime(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    validationError('Local Flash expireTime must be a valid ISO-8601 timestamp')
  }

  return value.trim()
}

function integerField(value: unknown, label: string, minimum: number, maximum?: number) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    validationError(`Local Flash ${label} must be an integer`)
  }
  if (value < minimum || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? `at least ${minimum}` : `${minimum} to ${maximum}`
    validationError(`Local Flash ${label} must be ${range}`)
  }

  return value
}

function localTriggers(value: unknown): LocalTrigger[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) validationError('Local Flash triggers must be an array')

  return value.map((trigger, index) => {
    const record = objectRecord(trigger)
    const notionalPrice = cleanOptionalAmount(record.notionalPrice, `triggers[${index}].notionalPrice`)
    const triggerType = record.triggerType

    if (!notionalPrice) validationError(`Local Flash triggers[${index}].notionalPrice is required`)
    if (triggerType !== 'lower' && triggerType !== 'upper') {
      validationError(`Local Flash triggers[${index}].triggerType must be lower or upper`)
    }

    return { notionalPrice, triggerType }
  })
}

function ensureNoTriggers(triggers: LocalTrigger[], orderType: FlashOrderType) {
  if (triggers.length) validationError(`Local Flash triggers are not allowed for ${orderType}`)
}

function ensureNoTwapFields(body: Record<string, any>, orderType: FlashOrderType) {
  if (body.durationSeconds !== undefined || body.twapBucketCount !== undefined) {
    validationError(`Local Flash TWAP fields are not allowed for ${orderType}`)
  }
}

function validateOrderParameters(body: Record<string, any>, orderType: FlashOrderType, side: FlashTradeSide) {
  const limitNotionalPrice = cleanOptionalAmount(body.limitNotionalPrice, 'limitNotionalPrice')
  const maxSlippage = optionalProtection(body.maxSlippage, 'maxSlippage')
  const maxPriceImpact = optionalProtection(body.maxPriceImpact, 'maxPriceImpact')
  const expireTime = optionalExpireTime(body.expireTime)
  const triggers = localTriggers(body.triggers)

  if (orderType === FLASH_BRACKET_ORDER_TYPE) {
    validationError('Local Flash bracket orders are not supported')
  }

  if (orderType === FLASH_MARKET_ORDER_TYPE) {
    ensureNoTriggers(triggers, orderType)
    ensureNoTwapFields(body, orderType)
    if (limitNotionalPrice) validationError('Local Flash limitNotionalPrice is not allowed for market')
    if (expireTime) validationError('Local Flash expireTime is not allowed for market')
  }

  if (orderType === FLASH_LIMIT_ORDER_TYPE) {
    ensureNoTriggers(triggers, orderType)
    ensureNoTwapFields(body, orderType)
    if (!limitNotionalPrice) validationError('Local Flash limitNotionalPrice is required for limit')
  }

  if (orderType === FLASH_TWAP_ORDER_TYPE) {
    ensureNoTriggers(triggers, orderType)
    if (limitNotionalPrice) validationError('Local Flash limitNotionalPrice is not supported for TWAP')
    if (expireTime) validationError('Local Flash expireTime is not allowed for TWAP')
    integerField(
      body.durationSeconds,
      'durationSeconds',
      MIN_TWAP_DURATION_SECONDS,
      MAX_TWAP_DURATION_SECONDS
    )
    if (body.twapBucketCount !== undefined) {
      integerField(body.twapBucketCount, 'twapBucketCount', MIN_TWAP_BUCKET_COUNT, MAX_TWAP_BUCKET_COUNT)
    }
  }

  if (
    orderType === FLASH_STOP_ORDER_TYPE ||
    orderType === FLASH_STOP_LOSS_ORDER_TYPE ||
    orderType === FLASH_TAKE_PROFIT_ORDER_TYPE
  ) {
    ensureNoTwapFields(body, orderType)
    if (triggers.length !== 1) validationError(`Local Flash ${orderType} requires exactly one trigger`)

    const expected =
      orderType === FLASH_STOP_ORDER_TYPE
        ? { side: 'buy', triggerType: 'upper' }
        : orderType === FLASH_STOP_LOSS_ORDER_TYPE
          ? { side: 'sell', triggerType: 'lower' }
          : { side: 'sell', triggerType: 'upper' }

    if (side !== expected.side || triggers[0]?.triggerType !== expected.triggerType) {
      validationError(
        `Local Flash ${orderType} requires a ${expected.side} side with an ${expected.triggerType} trigger`
      )
    }
  }

  return {
    expireTime,
    limitNotionalPrice,
    maxPriceImpact,
    maxSlippage,
    triggers
  }
}

function formatAmount(value: number, asset: FlashAsset) {
  if (!Number.isFinite(value) || value <= 0) return '0'

  const decimals = asset.symbol.toUpperCase() === 'USDC' ? 2 : 6

  return value
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

function formatNotional(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'

  return value
    .toFixed(6)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

function quantityHex(value: bigint) {
  return `0x${value.toString(16)}`
}

function checksumAddress(address: string, label: string) {
  if (!isAddress(address)) throw new Error(`Invalid ${label} address`)

  return getAddress(address)
}

function localAssetFromAddress(address: unknown, label: string) {
  const normalized = String(address || '')
    .trim()
    .toLowerCase()
  const asset = [FLASH_NATIVE_ETH_ASSET, FLASH_WETH_ASSET, FLASH_USDC_ASSET].find((candidate) => {
    return toFlashApiAssetAddress(candidate).toLowerCase() === normalized
  })

  if (!asset) throw new Error(`Unsupported local Flash ${label} asset`)

  return asset
}

function localSide(side: unknown): FlashTradeSide {
  if (side === 'buy' || side === 'sell') return side

  throw new Error('Unsupported local Flash trade side')
}

function localOrderType(orderType: unknown): FlashOrderType {
  const value = String(orderType || FLASH_MARKET_ORDER_TYPE)
  const supported = [
    FLASH_MARKET_ORDER_TYPE,
    FLASH_LIMIT_ORDER_TYPE,
    FLASH_TWAP_ORDER_TYPE,
    FLASH_STOP_ORDER_TYPE,
    FLASH_STOP_LOSS_ORDER_TYPE,
    FLASH_TAKE_PROFIT_ORDER_TYPE,
    FLASH_BRACKET_ORDER_TYPE
  ]

  if (supported.includes(value as FlashOrderType)) return value as FlashOrderType

  throw new Error('Unsupported local Flash order type')
}

function settlementSpentAsset(spentAsset: FlashAsset) {
  return spentAsset.isNative ? FLASH_WETH_ASSET : spentAsset
}

function settlementInputToken(spentAsset: FlashAsset) {
  const asset = settlementSpentAsset(spentAsset)

  if (!asset.address) throw new Error(`Cannot settle unsupported input asset ${asset.symbol}`)

  return checksumAddress(asset.address, `${asset.symbol} token`)
}

function settlementOutputToken(receiveAsset: FlashAsset) {
  if (receiveAsset.isNative) return FLASH_NATIVE_ETH_TOKEN_ADDRESS
  if (!receiveAsset.address) throw new Error(`Cannot settle unsupported output asset ${receiveAsset.symbol}`)

  return checksumAddress(receiveAsset.address, `${receiveAsset.symbol} token`)
}

async function readAllowance(asset: FlashAsset, owner: string, spender: string) {
  if (!asset.address) throw new Error(`Cannot check allowance for ${asset.symbol}`)

  try {
    const result = await provider().call({
      to: checksumAddress(asset.address, `${asset.symbol} token`),
      data: erc20Interface.encodeFunctionData('allowance', [owner, spender])
    })
    const [allowance] = erc20Interface.decodeFunctionResult('allowance', result)

    return allowance as bigint
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Local Flash service could not read Anvil allowance at ${ANVIL_RPC_URL}: ${message}`, {
      cause: error
    })
  }
}

function buildWrapAction({
  accountAddress,
  amount,
  amountRaw
}: {
  accountAddress: string
  amount: string
  amountRaw: bigint
}): FlashQuoteAction {
  return {
    id: 'wrap',
    kind: 'wrap',
    label: `Wrap ${FLASH_NATIVE_ETH_ASSET.symbol}`,
    asset: FLASH_NATIVE_ETH_ASSET,
    amount,
    amountRaw: amountRaw.toString(),
    tx: {
      chainId: FLASH_ANVIL_CHAIN_ID,
      from: accountAddress,
      to: checksumAddress(FLASH_WETH_ASSET.address || '', 'WETH token'),
      data: wethInterface.encodeFunctionData('deposit'),
      value: quantityHex(amountRaw)
    }
  }
}

async function buildApprovalAction({
  accountAddress,
  amount,
  amountRaw,
  spentAsset
}: {
  accountAddress: string
  amount: string
  amountRaw: bigint
  spentAsset: FlashAsset
}): Promise<FlashQuoteAction | null> {
  const settlementAsset = settlementSpentAsset(spentAsset)
  if (settlementAsset.isNative || !settlementAsset.address) return null

  const owner = checksumAddress(accountAddress, 'funder')
  const spender = checksumAddress(LOCAL_MOCK_FLASH_SETTLEMENT_ADDRESS, 'settlement')
  const allowance = await readAllowance(settlementAsset, owner, spender)

  if (allowance >= amountRaw) return null

  return {
    id: 'approval',
    kind: 'approve',
    label: `Approve ${settlementAsset.symbol}`,
    asset: settlementAsset,
    amount,
    amountRaw: amountRaw.toString(),
    spender,
    tx: {
      chainId: FLASH_ANVIL_CHAIN_ID,
      from: owner,
      to: checksumAddress(settlementAsset.address, `${settlementAsset.symbol} token`),
      data: erc20Interface.encodeFunctionData('approve', [spender, MaxUint256]),
      value: '0x0'
    }
  }
}

function buildSteps({
  approvalAction,
  orderType,
  spentAsset,
  wrapAction
}: {
  approvalAction: FlashQuoteAction | null
  orderType: FlashOrderType
  spentAsset: FlashAsset
  wrapAction: FlashQuoteAction | null
}) {
  const steps: FlashStep[] = []

  if (wrapAction) {
    steps.push({ id: 'wrap', kind: 'wrap', label: wrapAction.label, status: 'required', asset: spentAsset })
  }

  if (approvalAction) {
    steps.push({
      id: 'approve',
      kind: 'approve',
      label: approvalAction.label,
      status: 'required',
      asset: approvalAction.asset
    })
  }

  steps.push(
    {
      id: 'sign',
      kind: 'sign',
      label: 'Sign order',
      status: 'required'
    },
    {
      id: 'submit',
      kind: 'submit',
      label: orderType === FLASH_MARKET_ORDER_TYPE ? 'Submit trade' : 'Submit order',
      status: 'required'
    }
  )

  return steps
}

function orderTypedData({
  accountAddress,
  orderType,
  quoteId,
  side,
  spentAsset,
  qty
}: {
  accountAddress: string
  orderType: FlashOrderType
  quoteId: string
  side: FlashTradeSide
  spentAsset: FlashAsset
  qty: string
}) {
  return {
    domain: {
      name: 'Definitive Flash Local',
      version: '1',
      chainId: FLASH_ANVIL_CHAIN_ID
    },
    primaryType: 'Order',
    types: {
      Order: [
        { name: 'quoteId', type: 'string' },
        { name: 'funder', type: 'address' },
        { name: 'side', type: 'string' },
        { name: 'orderType', type: 'string' },
        { name: 'qty', type: 'string' },
        { name: 'settlementAsset', type: 'string' }
      ]
    },
    message: {
      quoteId,
      funder: accountAddress,
      side,
      orderType,
      qty,
      settlementAsset: settlementSpentAsset(spentAsset).symbol
    }
  }
}

async function buildQuote(body: Record<string, any>) {
  const accountAddress = checksumAddress(String(body.funderAddress || ''), 'funder')
  const targetAsset = localAssetFromAddress(body.targetAsset, 'target')
  const contraAsset = localAssetFromAddress(body.contraAsset, 'contra')
  const side = localSide(body.side)
  const orderType = localOrderType(body.orderType)
  const orderParameters = validateOrderParameters(body, orderType, side)
  const qty = cleanAmount(body.qty || body.inputAmount)
  const amount = amountNumber(qty)

  if (!amount) validationError('Local Flash quote requires a positive qty')

  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const settlementAsset = settlementSpentAsset(spentAsset)
  const inputAmountRaw = parseUnits(qty, settlementAsset.decimals)
  const wrapAction = spentAsset.isNative
    ? buildWrapAction({ accountAddress, amount: qty, amountRaw: inputAmountRaw })
    : null
  const approvalAction = await buildApprovalAction({
    accountAddress,
    amount: qty,
    amountRaw: inputAmountRaw,
    spentAsset
  })
  const spentUsdRate = mockUsdRates[spentAsset.symbol] || 1
  const receiveUsdRate = mockUsdRates[receiveAsset.symbol] || 1
  const outputAmount = formatAmount((amount * spentUsdRate * 0.9992) / receiveUsdRate, receiveAsset)
  const inputNotional = formatNotional(amount * spentUsdRate)
  const outputNotional = formatNotional(Number(outputAmount) * receiveUsdRate)
  const estimatedFeeNotional = formatNotional(amount * spentUsdRate * 0.0008)
  const rateAmount = formatAmount(spentUsdRate / receiveUsdRate, receiveAsset)
  const quoteId = `local-quote-${crypto.randomUUID()}`
  const typedData = orderTypedData({ accountAddress, orderType, quoteId, qty, side, spentAsset })
  const expiresAt =
    orderParameters.expireTime ||
    new Date(
      Date.now() + (orderType === FLASH_TWAP_ORDER_TYPE ? Number(body.durationSeconds) * 1_000 : 30_000)
    ).toISOString()
  const quote: FlashQuote = {
    id: quoteId,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount: qty,
    outputAmount,
    rate: `1 ${spentAsset.symbol} = ${rateAmount || '0'} ${receiveAsset.symbol}`,
    steps: buildSteps({ approvalAction, orderType, spentAsset, wrapAction }),
    actions: {
      wrap: wrapAction,
      approval: approvalAction
    },
    expiresAt
  }
  const wrap = wrapAction
    ? {
        nativeAsset: toFlashApiAssetAddress(spentAsset),
        wrappedAsset: toFlashApiAssetAddress(settlementSpentAsset(spentAsset)),
        evmTx: wrapAction.tx,
        svmInstructions: null,
        amount: wrapAction.amount,
        amountRaw: wrapAction.amountRaw
      }
    : null
  const approval = approvalAction
    ? {
        amount: approvalAction.amount,
        amountRaw: approvalAction.amountRaw,
        spender: approvalAction.spender,
        evmTx: approvalAction.tx
      }
    : null
  const response = {
    quoteId,
    id: quoteId,
    orderType,
    side,
    targetAsset: toFlashApiAssetAddress(targetAsset),
    contraAsset: toFlashApiAssetAddress(contraAsset),
    from: {
      asset: side === 'buy' ? 'contra' : 'target',
      amount: qty,
      notional: inputNotional
    },
    to: {
      asset: side === 'buy' ? 'target' : 'contra',
      amount: outputAmount,
      notional: outputNotional
    },
    fees: { estimatedFeeNotional },
    wrap,
    evm: {
      approveTx: approvalAction?.tx || null,
      permitTypedData: null,
      orderTypedData: JSON.stringify(typedData)
    },
    svm: null,
    // Local-only compatibility fields used by the visual harness and order store.
    inputAmount: qty,
    outputAmount,
    estimatedOutputAmount: outputAmount,
    rate: quote.rate,
    spentAsset,
    receiveAsset,
    approval,
    actions: { approval: approvalAction, wrap: wrapAction },
    steps: quote.steps,
    expiresAt: quote.expiresAt,
    local: {
      ...orderParameters,
      chain: LOCAL_CHAIN_SLUG
    }
  }

  quote.raw = response
  quotes.set(quoteId, { body, quote, response })

  return response
}

function orderResponse(order: LocalOrderRecord) {
  const localParameters = objectRecord(order.quote.raw).local
  const targetAmount = order.side === 'sell' ? order.quote.inputAmount : order.quote.outputAmount
  const contraAmount = order.side === 'buy' ? order.quote.inputAmount : order.quote.outputAmount
  const assetRef = (asset: FlashAsset) => ({
    id: asset.id,
    name: asset.name,
    address: toFlashApiAssetAddress(asset),
    ticker: asset.symbol,
    chain: { id: LOCAL_CHAIN_SLUG, name: 'Anvil', namespace: 'eip155' }
  })

  return {
    ...order,
    normalizedStatus: order.status,
    status: `ORDER_STATUS_${order.status.toUpperCase()}`,
    closeReason: order.open
      ? null
      : order.status === 'cancelled'
        ? 'REASON_USER_REQUESTED'
        : 'REASON_FULLY_FILLED',
    funderAddress: order.accountAddress,
    targetAsset: assetRef(order.quote.targetAsset),
    contraAsset: assetRef(order.quote.contraAsset),
    qty: order.quote.inputAmount,
    filled:
      order.status === 'filled'
        ? {
            targetAmount,
            contraAmount,
            averagePrice: order.quote.rate || null,
            averageNotionalPrice: null
          }
        : null,
    limitNotionalPrice: localParameters.limitNotionalPrice || null,
    trigger: Array.isArray(localParameters.triggers) ? localParameters.triggers[0] || null : null,
    brackets: null,
    maxPriceImpact: localParameters.maxPriceImpact || null,
    twapBucketCount: localParameters.twapBucketCount || null,
    placedAt: order.createdAt,
    acceptedAt: order.createdAt,
    closedAt: order.open ? null : order.updatedAt,
    spentAsset: order.quote.spentAsset,
    receiveAsset: order.quote.receiveAsset,
    inputAmount: order.quote.inputAmount,
    outputAmount: order.quote.outputAmount,
    estimatedOutputAmount: order.quote.outputAmount,
    filledOutputAmount: order.filledOutputAmount || null,
    fillTransactionHash: order.fillTransactionHash || null
  }
}

function validateSubmitBody(quoteRecord: LocalQuoteRecord, body: Record<string, any>) {
  const quoteBody = quoteRecord.body
  const quoteResponse = quoteRecord.response
  const wrappedAsset = String(objectRecord(quoteResponse.wrap).wrappedAsset || '')
  const expectedTargetAsset =
    wrappedAsset && quoteBody.side === 'sell' ? wrappedAsset : String(quoteResponse.targetAsset || '')
  const expectedContraAsset =
    wrappedAsset && quoteBody.side === 'buy' ? wrappedAsset : String(quoteResponse.contraAsset || '')
  const expectedFields: Record<string, unknown> = {
    targetChain: quoteBody.targetChain,
    contraChain: quoteBody.contraChain,
    targetAsset: expectedTargetAsset,
    contraAsset: expectedContraAsset,
    side: quoteBody.side,
    qty: quoteBody.qty,
    orderType: quoteBody.orderType,
    funderAddress: quoteBody.funderAddress,
    quickTrade: quoteBody.quickTrade,
    maxSlippage: quoteBody.maxSlippage,
    maxPriceImpact: quoteBody.maxPriceImpact,
    limitNotionalPrice: quoteBody.limitNotionalPrice,
    twapBucketCount: quoteBody.twapBucketCount,
    triggers: quoteBody.triggers
  }

  for (const [field, expected] of Object.entries(expectedFields)) {
    if (expected === undefined && body[field] === undefined) continue
    if (JSON.stringify(body[field]) !== JSON.stringify(expected)) {
      validationError(`Local Flash submit ${field} must match the quote request`)
    }
  }

  if (body.durationSeconds !== undefined || body.expireTime !== undefined) {
    validationError('Local Flash submit must not include quote-only duration or expiry fields')
  }

  const expectedOrderTypedData = objectRecord(quoteResponse.evm).orderTypedData
  if (body.evmOrderTypedData !== expectedOrderTypedData) {
    validationError('Local Flash submit evmOrderTypedData must exactly echo the quote')
  }

  const expectedPermitTypedData = objectRecord(quoteResponse.evm).permitTypedData
  if (expectedPermitTypedData) {
    if (body.evmPermitTypedData !== expectedPermitTypedData || !body.evmPermitSignature) {
      validationError('Local Flash submit requires the quoted permit typed data and signature')
    }
  } else if (body.evmPermitTypedData !== undefined || body.evmPermitSignature !== undefined) {
    validationError('Local Flash submit must not include permit fields when the quote has no permit')
  }
}

function storeOrder(quoteRecord: LocalQuoteRecord, body: Record<string, any>) {
  const now = nowIso()
  const orderId = `local-order-${crypto.randomUUID()}`
  const orderType = quoteRecord.quote.orderType
  const order: LocalOrderRecord = {
    accountAddress: checksumAddress(
      String(quoteRecord.body.funderAddress || body.funderAddress || ''),
      'funder'
    ),
    cancellable: orderType !== FLASH_MARKET_ORDER_TYPE,
    chain: LOCAL_CHAIN_SLUG,
    chainId: FLASH_ANVIL_CHAIN_ID,
    createdAt: now,
    fillTransactionHash: null,
    filledOutputAmount: null,
    open: true,
    orderId,
    orderType,
    quote: quoteRecord.quote,
    quoteId: quoteRecord.quote.id || '',
    rawError: null,
    side: quoteRecord.quote.side,
    status: 'accepted',
    updatedAt: now
  }

  persistOrder(order)

  if (orderType === FLASH_MARKET_ORDER_TYPE) {
    setTimeout(() => {
      void fillMarketOrder(orderId)
    }, MARKET_FILL_DELAY_MS)
  }

  return order
}

async function fillMarketOrder(orderId: string) {
  const order = orders.get(orderId)
  if (!order || order.status !== 'accepted' || order.orderType !== FLASH_MARKET_ORDER_TYPE) return

  try {
    const quote = order.quote
    const payer = checksumAddress(order.accountAddress, 'order account')
    const recipient = payer
    const inputAsset = settlementSpentAsset(quote.spentAsset)
    const inputToken = settlementInputToken(inputAsset)
    const outputToken = settlementOutputToken(quote.receiveAsset)
    const inputAmountRaw = parseUnits(quote.inputAmount, inputAsset.decimals)
    const outputAmountRaw = parseUnits(quote.outputAmount, quote.receiveAsset.decimals)
    const data = settlementInterface.encodeFunctionData('swapExactInput', [
      payer,
      recipient,
      inputToken,
      outputToken,
      inputAmountRaw,
      outputAmountRaw
    ])
    const tx = await wallet().sendTransaction({
      to: checksumAddress(LOCAL_MOCK_FLASH_SETTLEMENT_ADDRESS, 'settlement'),
      data
    })
    const receipt = await tx.wait(1)

    if (receipt?.status !== 1) throw new Error(`Local Flash settlement failed: ${tx.hash}`)

    persistOrder({
      ...order,
      cancellable: false,
      fillTransactionHash: tx.hash,
      filledOutputAmount: quote.outputAmount,
      open: false,
      status: 'filled',
      updatedAt: nowIso()
    })
  } catch (error) {
    persistOrder({
      ...order,
      cancellable: false,
      open: false,
      rawError: error instanceof Error ? error.message : String(error),
      status: 'rejected',
      updatedAt: nowIso()
    })
  }
}

function parseOrderRoute(pathname: string) {
  const match = pathname.match(/^\/v1\/orders\/([^/]+)(?:\/(cancel))?$/)

  if (!match) return null

  return {
    orderId: decodeURIComponent(match[1]),
    action: match[2] || ''
  }
}

function filterOrders(url: URL) {
  const funder = String(url.searchParams.get('funderAddress') || '')
    .trim()
    .toLowerCase()
  if (!funder) validationError('Local Flash order list requires funderAddress')

  const statuses = new Set(
    String(url.searchParams.get('statuses') || '')
      .split(',')
      .map((status) =>
        status
          .trim()
          .toLowerCase()
          .replace(/^order_status_/, '')
          .replace(/_/g, '-')
      )
      .filter(Boolean)
  )
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize') || 50)))

  return Array.from(orders.values())
    .filter((order) => {
      if (funder && order.accountAddress.toLowerCase() !== funder) return false
      if (statuses.size && !statuses.has(order.status)) return false
      return true
    })
    .slice(0, pageSize)
}

export function resetLocalTradeState() {
  quotes.clear()
  orders.clear()
}

export async function handleLocalTradeRequest(req: Request) {
  try {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'local-trade',
        chainId: FLASH_ANVIL_CHAIN_ID,
        anvilRpcUrl: ANVIL_RPC_URL
      })
    }

    if (req.method === 'POST' && url.pathname === '/v1/quote') {
      const body = await readJson(req)
      const quote = await buildQuote(body)

      return jsonResponse(quote)
    }

    if (req.method === 'POST' && url.pathname === '/v1/order') {
      const body = await readJson(req)
      const quoteId = String(body.quoteId || '')
      const quoteRecord = quotes.get(quoteId)

      if (!quoteRecord) return errorResponse(`Unknown local Flash quote: ${quoteId}`, 404)
      if (!body.userSignature) return errorResponse('Local Flash submit requires userSignature', 400)
      validateSubmitBody(quoteRecord, body)

      const order = storeOrder(quoteRecord, body)

      return jsonResponse({ orderId: order.orderId, order: orderResponse(order) })
    }

    if (req.method === 'GET' && url.pathname === '/v1/orders') {
      const list = filterOrders(url).map(orderResponse)

      return jsonResponse({ orders: list, count: list.length })
    }

    const orderRoute = parseOrderRoute(url.pathname)

    if (orderRoute && req.method === 'GET' && !orderRoute.action) {
      const order = orders.get(orderRoute.orderId)
      const funderAddress = String(url.searchParams.get('funderAddress') || '')
        .trim()
        .toLowerCase()

      if (!order) return errorResponse(`Unknown local Flash order: ${orderRoute.orderId}`, 404)
      if (!funderAddress) return errorResponse('Local Flash order lookup requires funderAddress', 400)
      if (order.accountAddress.toLowerCase() !== funderAddress) {
        return errorResponse(`Unknown local Flash order: ${orderRoute.orderId}`, 404)
      }

      return jsonResponse(orderResponse(order))
    }

    if (orderRoute && req.method === 'POST' && orderRoute.action === 'cancel') {
      const order = orders.get(orderRoute.orderId)
      const body = await readJson(req)
      const cancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${orderRoute.orderId}`

      if (!order) return errorResponse(`Unknown local Flash order: ${orderRoute.orderId}`, 404)
      if (body.cancelMessage !== cancelMessage) {
        return errorResponse('Local Flash cancelMessage does not match the canonical order message', 400)
      }
      if (!body.userSignature) return errorResponse('Local Flash cancel requires userSignature', 400)
      if (order.status === 'cancelled')
        return jsonResponse({ orderId: order.orderId, order: orderResponse(order) })
      if (!order.open || !order.cancellable) return errorResponse('Local Flash order is not cancellable', 409)

      const nextOrder: LocalOrderRecord = {
        ...order,
        cancellable: false,
        open: false,
        status: 'cancelled',
        updatedAt: nowIso()
      }

      persistOrder(nextOrder)

      return jsonResponse({ orderId: nextOrder.orderId, order: orderResponse(nextOrder) })
    }

    return errorResponse('Not found', 404)
  } catch (error) {
    return errorResponse(error, error instanceof LocalTradeValidationError ? 400 : 500)
  }
}
