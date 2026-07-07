import { randomUUID } from 'crypto'
import { Interface, JsonRpcProvider, MaxUint256, Wallet, getAddress, isAddress, parseUnits } from 'ethers'

import store from '../store'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_MOCK_SETTLEMENT_ADDRESS,
  FLASH_NATIVE_ETH_ASSET,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_P0_ASSETS,
  FLASH_WETH_ADDRESS,
  FLASH_WETH_ASSET,
  getReceiveAsset,
  getSpentAsset,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteFee,
  type FlashQuoteTransactionRequest,
  type FlashStep,
  type FlashTradeSide
} from '../../resources/domain/flash'

type FlashMockMode = 'mock'
type FlashOrderStatus =
  | 'pending'
  | 'accepted'
  | 'partially-filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'terminated'
  | 'expired'

type FlashChainInput =
  | number
  | string
  | {
      id?: number | string
      chainId?: number | string
    }
  | null
  | undefined

type FlashAssetInput = FlashAsset | string | null | undefined

export interface FlashQuoteRequest {
  accountAddress?: string
  targetChain?: FlashChainInput
  contraChain?: FlashChainInput
  chainId?: number | string
  targetAsset?: FlashAssetInput
  contraAsset?: FlashAssetInput
  side?: FlashTradeSide
  qty?: string
  inputAmount?: string
  orderType?: FlashOrderType
  slippage?: string | number
  quickTrade?: boolean
}

export interface FlashSubmitOrderRequest extends FlashQuoteRequest {
  quote?: FlashQuote
  quoteId?: string
  signature?: string
  orderSignature?: string
  rawPayload?: unknown
}

export interface FlashListOrdersRequest {
  accountAddress?: string
  chainId?: number | string
  status?: FlashOrderStatus | FlashOrderStatus[] | string | string[]
}

export interface FlashGetOrderRequest {
  orderId: string
}

export interface FlashCancelOrderRequest {
  orderId: string
  signature?: string
}

interface FlashRuntime {
  mode: FlashMockMode
  environment: string
  profile: string | null
}

interface FlashOrderRecord {
  orderId: string
  accountAddress: string
  chainId: number
  provider: 'flash'
  source: 'flash'
  environment: string
  profile: string | null
  status: FlashOrderStatus
  rawStatus: string
  orderType: string
  side: string
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  qty: string
  spentAsset: FlashAsset
  spentAmount: string
  outputAmount: string
  estimatedOutputAmount: string
  filledOutputAmount?: string | null
  averageFillPrice?: string | null
  createdAt: number
  updatedAt: number
  terminalAt?: number | null
  open: boolean
  cancellable: boolean
  quoteId?: string
  receiveAsset: FlashAsset
  rate?: string
  rawPayload?: unknown
  rawStatusPayload?: unknown
  fillHash?: string | null
  fillTransactionHash?: string | null
}

interface MockOrderState {
  record: FlashOrderRecord
  rawOrder: Record<string, unknown>
  fillPollStartedAt?: number
  fillPromise?: Promise<FlashOrderRecord>
  fillError?: string | null
}

const mockOrders = new Map<string, MockOrderState>()
const mockUsdRates: Record<string, number> = {
  ETH: 2400,
  WETH: 2400,
  USDC: 1
}

const FLASH_ANVIL_RPC_URL =
  process.env.FLASH_ANVIL_RPC_URL || process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545'
// Anvil's first default private key pays gas for mock settlement transactions.
// The submitted order account remains the settlement payer and recipient.
const FLASH_ANVIL_GAS_PAYER_PRIVATE_KEY =
  process.env.FLASH_ANVIL_GAS_PAYER_PRIVATE_KEY ||
  process.env.ANVIL_DEPLOYER_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const FLASH_MARKET_FILL_DELAY_MS = 3_000
const FLASH_MARKET_ORDER_NOTIFICATION_MS = 60 * 1000
const FLASH_RESOLVED_ORDER_NOTIFICATION_MS = 3 * 1000
const FLASH_MARKET_ORDER_POLL_MS = 3 * 1000
const FLASH_OPEN_ORDER_POLL_MS = 5 * 60 * 1000

const erc20Interface = new Interface([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
])
const wethInterface = new Interface(['function deposit() payable'])
const settlementInterface = new Interface([
  'function swapExactInput(address payer,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount) returns (uint256)'
])
let mockProvider: JsonRpcProvider | null = null
let openOrderPoller: ReturnType<typeof setInterval> | null = null
let openOrderRefresh: Promise<FlashOrderRecord[]> | null = null

const terminalStatuses = new Set<FlashOrderStatus>([
  'filled',
  'cancelled',
  'rejected',
  'terminated',
  'expired'
])
const openStatuses = new Set<FlashOrderStatus>(['pending', 'accepted', 'partially-filled'])

interface FlashMarketOrderPoller {
  deadline: number
  timer?: ReturnType<typeof setTimeout>
}

const marketOrderPollers = new Map<string, FlashMarketOrderPoller>()

function runtime(): FlashRuntime {
  return {
    mode: 'mock',
    environment: process.env.NODE_ENV || 'development',
    profile: process.env.FRAME_PROFILE || null
  }
}

function normalizeAddress(address?: string) {
  return (address || '').trim().toLowerCase()
}

function checksumAddress(address: string, label: string) {
  if (!isAddress(address)) throw new Error(`Invalid Flash ${label} address`)

  return getAddress(address)
}

function normalizeAmount(amount?: string) {
  return (amount || '').trim().replace(/,/g, '')
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function amountNumber(amount?: string) {
  const parsed = Number(normalizeAmount(amount))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatAmount(value: number, asset: FlashAsset) {
  if (!Number.isFinite(value) || value <= 0) return '0'

  const decimals = asset.symbol === 'USDC' ? 2 : 6

  return value
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

function parseAssetAmount(amount: string, asset: FlashAsset) {
  return parseUnits(normalizeAmount(amount), asset.decimals)
}

function quantityHex(value: bigint) {
  return `0x${value.toString(16)}`
}

function getMockProvider() {
  if (!mockProvider) mockProvider = new JsonRpcProvider(FLASH_ANVIL_RPC_URL, FLASH_ANVIL_CHAIN_ID)

  return mockProvider
}

function getMockWallet() {
  return new Wallet(FLASH_ANVIL_GAS_PAYER_PRIVATE_KEY, getMockProvider())
}

function chainIdFrom(input: FlashChainInput) {
  if (input && typeof input === 'object') return chainIdFrom(input.chainId ?? input.id)

  const parsed = Number(input)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function resolveChainId(request: FlashQuoteRequest) {
  return (
    chainIdFrom(request.chainId) ||
    chainIdFrom(request.targetChain) ||
    chainIdFrom(request.contraChain) ||
    FLASH_ANVIL_CHAIN_ID
  )
}

function requireMockChain(chainId: number) {
  if (chainId !== FLASH_ANVIL_CHAIN_ID) {
    throw new Error(`Flash mock only supports Anvil chain ${FLASH_ANVIL_CHAIN_ID}`)
  }
}

function settlementSpentAsset(spentAsset: FlashAsset): FlashAsset {
  return spentAsset.id === FLASH_NATIVE_ETH_ASSET.id ? FLASH_WETH_ASSET : spentAsset
}

function settlementInputToken(spentAsset: FlashAsset) {
  const asset = settlementSpentAsset(spentAsset)

  if (!asset.address) throw new Error(`Flash mock cannot settle unsupported input asset ${asset.symbol}`)

  return checksumAddress(asset.address, `${asset.symbol} token`)
}

function settlementOutputToken(receiveAsset: FlashAsset) {
  if (receiveAsset.id === FLASH_NATIVE_ETH_ASSET.id) return FLASH_NATIVE_ETH_TOKEN_ADDRESS
  if (!receiveAsset.address)
    throw new Error(`Flash mock cannot settle unsupported output asset ${receiveAsset.symbol}`)

  return checksumAddress(receiveAsset.address, `${receiveAsset.symbol} token`)
}

function resolveAsset(input: FlashAssetInput, label: string): FlashAsset {
  if (input && typeof input === 'object') return input

  const normalized = (input || '').trim().toLowerCase()
  const asset = FLASH_P0_ASSETS.find((candidate) => {
    const flashAsset = candidate as FlashAsset

    return (
      flashAsset.id.toLowerCase() === normalized ||
      flashAsset.symbol.toLowerCase() === normalized ||
      flashAsset.address?.toLowerCase() === normalized
    )
  })

  if (!asset) throw new Error(`Unsupported Flash ${label} asset`)

  return asset
}

function requireSide(side?: FlashTradeSide) {
  if (side !== 'buy' && side !== 'sell') throw new Error('Unsupported Flash trade side')

  return side
}

function statusPayload(orderId: string, status: FlashOrderStatus) {
  return {
    orderId,
    status: toRawStatus(status),
    normalizedStatus: status,
    source: 'flash',
    provider: 'flash'
  }
}

function toRawStatus(status: FlashOrderStatus) {
  return `ORDER_STATUS_${status.replace(/-/g, '_').toUpperCase()}`
}

function isOpenStatus(status: FlashOrderStatus) {
  return openStatuses.has(status)
}

function isTerminalStatus(status: FlashOrderStatus) {
  return terminalStatuses.has(status)
}

function buildSteps({
  spentAsset,
  settlementAsset,
  hasQuote,
  needsApproval
}: {
  spentAsset: FlashAsset
  settlementAsset: FlashAsset
  hasQuote: boolean
  needsApproval: boolean
}): FlashStep[] {
  const status = hasQuote ? 'required' : 'idle'
  const steps: FlashStep[] = []

  if (spentAsset.id === FLASH_NATIVE_ETH_ASSET.id) {
    steps.push({
      id: 'wrap',
      kind: 'wrap',
      label: `Wrap ${spentAsset.symbol}`,
      status,
      asset: spentAsset
    })
  }

  if (needsApproval) {
    steps.push({
      id: 'approve',
      kind: 'approve',
      label: `Approve ${settlementAsset.symbol}`,
      status,
      asset: settlementAsset
    })
  }

  steps.push(
    {
      id: 'sign',
      kind: 'sign',
      label: 'Sign quote',
      status
    },
    {
      id: 'submit',
      kind: 'submit',
      label: 'Submit trade',
      status
    }
  )

  return steps
}

async function readAllowance(asset: FlashAsset, owner: string, spender: string) {
  if (!asset.address) throw new Error(`Flash mock cannot check allowance for ${asset.symbol}`)

  const result = await getMockProvider().call({
    to: checksumAddress(asset.address, `${asset.symbol} token`),
    data: erc20Interface.encodeFunctionData('allowance', [owner, spender])
  })
  const [allowance] = erc20Interface.decodeFunctionResult('allowance', result)

  return allowance as bigint
}

function buildWrapAction({
  accountAddress,
  amount,
  amountRaw,
  chainId
}: {
  accountAddress?: string
  amount: string
  amountRaw: bigint
  chainId: number
}): FlashQuoteAction {
  const tx: FlashQuoteTransactionRequest = {
    chainId,
    to: FLASH_WETH_ADDRESS,
    data: wethInterface.encodeFunctionData('deposit'),
    value: quantityHex(amountRaw)
  }

  if (accountAddress) tx.from = accountAddress

  return {
    id: 'wrap',
    kind: 'wrap',
    label: `Wrap ${FLASH_NATIVE_ETH_ASSET.symbol}`,
    asset: FLASH_NATIVE_ETH_ASSET,
    amount,
    amountRaw: amountRaw.toString(),
    tx
  }
}

async function buildApprovalAction({
  accountAddress,
  amount,
  amountRaw,
  chainId,
  spentAsset
}: {
  accountAddress?: string
  amount: string
  amountRaw: bigint
  chainId: number
  spentAsset: FlashAsset
}): Promise<FlashQuoteAction | null> {
  const settlementAsset = settlementSpentAsset(spentAsset)

  if (!accountAddress || settlementAsset.isNative || !settlementAsset.address) return null

  const owner = checksumAddress(accountAddress, 'account')
  const spender = checksumAddress(FLASH_MOCK_SETTLEMENT_ADDRESS, 'settlement')
  const allowance = await readAllowance(settlementAsset, owner, spender)

  if (allowance >= amountRaw) return null

  return {
    id: 'approve',
    kind: 'approve',
    label: `Approve ${settlementAsset.symbol}`,
    asset: settlementAsset,
    amount,
    amountRaw: amountRaw.toString(),
    spender,
    tx: {
      chainId,
      from: owner,
      to: checksumAddress(settlementAsset.address, `${settlementAsset.symbol} token`),
      data: erc20Interface.encodeFunctionData('approve', [spender, MaxUint256]),
      value: '0x0'
    }
  }
}

async function buildQuote(request: FlashQuoteRequest) {
  const chainId = resolveChainId(request)
  requireMockChain(chainId)

  const targetAsset = resolveAsset(request.targetAsset, 'target')
  const contraAsset = resolveAsset(request.contraAsset, 'contra')
  const side = requireSide(request.side)
  const orderType = request.orderType || FLASH_MARKET_ORDER_TYPE
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const inputAmount = normalizeAmount(request.qty || request.inputAmount)
  const amount = amountNumber(inputAmount)

  if (!amount) throw new Error('Flash quote requires a positive qty')

  const accountAddress = request.accountAddress
    ? checksumAddress(request.accountAddress, 'account')
    : undefined
  const settlementAsset = settlementSpentAsset(spentAsset)
  const inputAmountRaw = parseAssetAmount(inputAmount, settlementAsset)
  const wrapAction =
    spentAsset.id === FLASH_NATIVE_ETH_ASSET.id
      ? buildWrapAction({ accountAddress, amount: inputAmount, amountRaw: inputAmountRaw, chainId })
      : null
  const approvalAction = await buildApprovalAction({
    accountAddress,
    amount: inputAmount,
    amountRaw: inputAmountRaw,
    chainId,
    spentAsset
  })
  const actions = {
    wrap: wrapAction,
    approval: approvalAction
  }
  const spentUsdRate = mockUsdRates[spentAsset.symbol] || 1
  const receiveUsdRate = mockUsdRates[receiveAsset.symbol] || 1
  const outputAmount = formatAmount((amount * spentUsdRate * 0.9992) / receiveUsdRate, receiveAsset)
  const feeAmount = formatAmount(amount * 0.0008, spentAsset)
  const rateAmount = formatAmount(spentUsdRate / receiveUsdRate, receiveAsset)
  const quoteId = `mock-quote-${randomUUID()}`
  const expiresAt = new Date(Date.now() + 30_000).toISOString()
  const fees: FlashQuoteFee[] = [
    {
      label: 'Flash mock fee',
      amount: feeAmount,
      asset: spentAsset
    }
  ]
  const quote: FlashQuote = {
    id: quoteId,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount,
    outputAmount,
    rate: `1 ${spentAsset.symbol} = ${rateAmount || '0'} ${receiveAsset.symbol}`,
    fees,
    steps: buildSteps({
      spentAsset,
      settlementAsset,
      hasQuote: true,
      needsApproval: !!approvalAction
    }),
    actions,
    expiresAt,
    raw: {
      quoteId,
      targetChain: chainId,
      contraChain: chainId,
      targetAsset,
      contraAsset,
      side,
      qty: inputAmount,
      orderType,
      estimatedOutputAmount: outputAmount,
      settlementSpentAsset: settlementAsset,
      settlementContract: FLASH_MOCK_SETTLEMENT_ADDRESS,
      actions,
      expiresAt
    }
  }

  return {
    chainId,
    targetAsset,
    contraAsset,
    side,
    orderType,
    spentAsset,
    receiveAsset,
    inputAmount,
    outputAmount,
    quote,
    flash: {
      quoteId,
      targetChain: chainId,
      contraChain: chainId,
      targetAsset,
      contraAsset,
      side,
      qty: inputAmount,
      orderType,
      estimatedOutputAmount: outputAmount,
      rate: quote.rate,
      fees,
      expiresAt,
      settlementSpentAsset: settlementAsset,
      settlementContract: FLASH_MOCK_SETTLEMENT_ADDRESS,
      actions: {
        wrap: wrapAction,
        approval: approvalAction,
        evm: {
          approveTx: approvalAction?.tx || null,
          orderTypedData: {
            domain: {
              name: 'Definitive Flash Mock',
              version: '1',
              chainId
            },
            primaryType: 'Order',
            types: {
              Order: [
                { name: 'quoteId', type: 'string' },
                { name: 'side', type: 'string' },
                { name: 'qty', type: 'string' },
                { name: 'settlementAsset', type: 'string' }
              ]
            },
            message: {
              quoteId,
              side,
              qty: inputAmount,
              settlementAsset: settlementAsset.symbol
            }
          }
        }
      }
    }
  }
}

function storeOrders() {
  return (store('main.orders') || {}) as Record<string, FlashOrderRecord>
}

function titleize(value: string) {
  return String(value || '')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function assetSymbol(asset?: FlashAsset) {
  return asset?.symbol || 'asset'
}

function orderNotificationId(orderId: string) {
  return `flash-order:${orderId}`
}

function orderNotificationTitle(record: FlashOrderRecord) {
  const side = titleize(record.side || 'trade')
  const type = titleize(record.orderType || 'order')

  return `${side} ${assetSymbol(record.targetAsset)} ${type} Order`
}

function orderNotificationDetail(record: FlashOrderRecord, status: FlashOrderStatus = record.status) {
  const outputAmount = record.filledOutputAmount || record.outputAmount || record.estimatedOutputAmount
  const flow = `${record.spentAmount} ${assetSymbol(record.spentAsset)} -> ${outputAmount} ${assetSymbol(
    record.receiveAsset
  )}`

  if (status === 'filled') return `Filled ${flow}`
  if (status === 'cancelled') return `Cancelled ${flow}`
  if (status === 'rejected') return `Rejected ${flow}`
  if (status === 'expired') return `Expired ${flow}`
  if (status === 'terminated') return `Terminated ${flow}`

  return flow
}

function orderNotificationTarget(record: FlashOrderRecord) {
  return {
    type: 'flashOrder',
    orderId: record.orderId,
    account: record.accountAddress,
    chainId: record.chainId,
    chainType: 'ethereum'
  }
}

function orderNotificationMetadata(record: FlashOrderRecord) {
  return {
    orderId: record.orderId,
    status: record.status,
    rawStatus: record.rawStatus,
    orderType: record.orderType,
    side: record.side
  }
}

function upsertPendingOrderNotification(record: FlashOrderRecord, now = Date.now()) {
  const createdAt = record.createdAt || now

  store.upsertPendingNotification({
    id: orderNotificationId(record.orderId),
    state: 'pending',
    title: orderNotificationTitle(record),
    detail: orderNotificationDetail(record),
    createdAt,
    updatedAt: now,
    expiresAt: createdAt + FLASH_MARKET_ORDER_NOTIFICATION_MS,
    leadingIcon: {
      chainType: 'ethereum',
      chainId: record.chainId
    },
    target: orderNotificationTarget(record),
    metadata: orderNotificationMetadata(record)
  })
}

function terminalOrderNotificationState(record: FlashOrderRecord) {
  return record.status === 'filled' ? 'completed' : 'failed'
}

function resolveOrderNotification(record: FlashOrderRecord, now = Date.now()) {
  if (!isTerminalStatus(record.status)) return

  store.resolveNotification(orderNotificationId(record.orderId), terminalOrderNotificationState(record), {
    title: orderNotificationTitle(record),
    detail: orderNotificationDetail(record, record.status),
    expiresAt: now + FLASH_RESOLVED_ORDER_NOTIFICATION_MS,
    updatedAt: now,
    target: orderNotificationTarget(record),
    metadata: orderNotificationMetadata(record)
  })
}

function dropOrderNotification(orderId: string) {
  store.expireNotification(orderNotificationId(orderId))
}

function terminalWithinNotificationWindow(record: FlashOrderRecord, deadline: number) {
  return isTerminalStatus(record.status) && (!record.terminalAt || record.terminalAt <= deadline)
}

function recordWithStatus(
  record: FlashOrderRecord,
  status: FlashOrderStatus,
  now = Date.now()
): FlashOrderRecord {
  const open = isOpenStatus(status)

  return {
    ...record,
    status,
    rawStatus: toRawStatus(status),
    updatedAt: now,
    terminalAt: isTerminalStatus(status) ? record.terminalAt || now : null,
    open,
    cancellable: open,
    rawStatusPayload: statusPayload(record.orderId, status)
  }
}

function upsertRecord(record: FlashOrderRecord) {
  store.upsertOrder(record)
  return record
}

function updateRecord(orderId: string, record: FlashOrderRecord) {
  store.updateOrder(orderId, record)
  return record
}

function getRecord(orderId: string) {
  return storeOrders()[orderId] || mockOrders.get(orderId)?.record
}

function hasOpenOrders() {
  return Object.values(storeOrders()).some((order) => isOpenStatus(order.status))
}

function stopMarketOrderPolling(orderId: string) {
  const poller = marketOrderPollers.get(orderId)
  if (poller?.timer) clearTimeout(poller.timer)
  marketOrderPollers.delete(orderId)
}

function scheduleMarketOrderPoll(orderId: string, poller: FlashMarketOrderPoller) {
  if (!marketOrderPollers.has(orderId)) return

  poller.timer = setTimeout(() => {
    void pollMarketOrder(orderId, poller)
  }, FLASH_MARKET_ORDER_POLL_MS)
}

async function pollMarketOrder(orderId: string, poller: FlashMarketOrderPoller) {
  const current = getRecord(orderId)

  if (!current) {
    dropOrderNotification(orderId)
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (current.orderType !== FLASH_MARKET_ORDER_TYPE) {
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (isTerminalStatus(current.status)) {
    if (terminalWithinNotificationWindow(current, poller.deadline)) resolveOrderNotification(current)
    else dropOrderNotification(orderId)

    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (Date.now() >= poller.deadline) {
    dropOrderNotification(orderId)
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  let nextOrder = current

  try {
    nextOrder = await advanceMarketFill(current)
  } catch (error) {
    console.error('error polling Flash market order', error)
  }

  const latest = getRecord(orderId) || nextOrder

  if (isTerminalStatus(latest.status)) {
    if (terminalWithinNotificationWindow(latest, poller.deadline)) resolveOrderNotification(latest)
    else dropOrderNotification(orderId)

    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (Date.now() >= poller.deadline) {
    dropOrderNotification(orderId)
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  upsertPendingOrderNotification(latest)
  scheduleMarketOrderPoll(orderId, poller)
}

function startMarketOrderPolling(record: FlashOrderRecord) {
  if (record.orderType !== FLASH_MARKET_ORDER_TYPE) return

  const now = Date.now()
  upsertPendingOrderNotification(record, now)

  if (isTerminalStatus(record.status)) {
    resolveOrderNotification(record, now)
    return
  }

  if (marketOrderPollers.has(record.orderId)) return

  const poller = {
    deadline: (record.createdAt || now) + FLASH_MARKET_ORDER_NOTIFICATION_MS
  }

  marketOrderPollers.set(record.orderId, poller)
  void pollMarketOrder(record.orderId, poller)
}

export function stopOpenOrderPolling() {
  if (!openOrderPoller) return

  clearInterval(openOrderPoller)
  openOrderPoller = null
}

function ensureOpenOrderPolling() {
  if (!hasOpenOrders()) {
    stopOpenOrderPolling()
    return
  }

  if (openOrderPoller) return

  openOrderPoller = setInterval(() => {
    void refreshOpenOrders()
      .catch((error) => {
        console.error('error refreshing Flash open orders', error)
      })
      .finally(() => {
        ensureOpenOrderPolling()
      })
  }, FLASH_OPEN_ORDER_POLL_MS)
}

export function startOpenOrderPolling() {
  ensureOpenOrderPolling()
}

function sortOrders(a: FlashOrderRecord, b: FlashOrderRecord) {
  if (a.open !== b.open) return a.open ? -1 : 1

  return Number(b.createdAt || 0) - Number(a.createdAt || 0)
}

function ensureMockOrderState(record: FlashOrderRecord) {
  const existing = mockOrders.get(record.orderId)

  if (existing) {
    existing.record = record
    return existing
  }

  const rawOrder = {
    orderId: record.orderId,
    status: record.rawStatus,
    normalizedStatus: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    quote: objectPayload(record.rawPayload).quote || null,
    settlement: null
  }
  const state: MockOrderState = { record, rawOrder }

  mockOrders.set(record.orderId, state)
  return state
}

function shouldMarketFill(record: FlashOrderRecord) {
  return record.status === 'accepted' && record.orderType === FLASH_MARKET_ORDER_TYPE
}

function settlementRawOrder(
  record: FlashOrderRecord,
  settlement: Record<string, unknown>,
  status: FlashOrderStatus = record.status
) {
  return {
    ...(mockOrders.get(record.orderId)?.rawOrder || {}),
    orderId: record.orderId,
    status: toRawStatus(status),
    normalizedStatus: status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    quote: objectPayload(record.rawPayload).quote || null,
    settlement
  }
}

async function executeMarketFill(record: FlashOrderRecord) {
  const payer = checksumAddress(record.accountAddress, 'order account')
  const recipient = payer
  const inputAsset = settlementSpentAsset(record.spentAsset)
  const inputToken = settlementInputToken(inputAsset)
  const outputToken = settlementOutputToken(record.receiveAsset)
  const inputAmountRaw = parseAssetAmount(record.spentAmount, inputAsset)
  const outputAmountRaw = parseAssetAmount(record.estimatedOutputAmount, record.receiveAsset)
  const data = settlementInterface.encodeFunctionData('swapExactInput', [
    payer,
    recipient,
    inputToken,
    outputToken,
    inputAmountRaw,
    outputAmountRaw
  ])
  const tx = await getMockWallet().sendTransaction({
    to: checksumAddress(FLASH_MOCK_SETTLEMENT_ADDRESS, 'settlement'),
    data
  })
  const receipt = await tx.wait(1)

  if (receipt?.status !== 1) throw new Error(`Flash mock settlement failed: ${tx.hash}`)

  const settlement = {
    transactionHash: tx.hash,
    blockNumber: receipt?.blockNumber || null,
    payer,
    recipient,
    inputToken,
    outputToken,
    inputAmount: inputAmountRaw.toString(),
    outputAmount: outputAmountRaw.toString(),
    settlementContract: FLASH_MOCK_SETTLEMENT_ADDRESS
  }
  const nextRecord = recordWithStatus(
    {
      ...record,
      outputAmount: record.estimatedOutputAmount,
      filledOutputAmount: record.estimatedOutputAmount,
      fillHash: tx.hash,
      fillTransactionHash: tx.hash,
      rawPayload: {
        ...objectPayload(record.rawPayload),
        settlement
      }
    },
    'filled'
  )
  const rawOrder = settlementRawOrder(nextRecord, settlement, 'filled')

  mockOrders.set(record.orderId, { record: nextRecord, rawOrder })

  return updateRecord(record.orderId, nextRecord)
}

async function advanceMarketFill(record: FlashOrderRecord, now = Date.now()) {
  if (!shouldMarketFill(record)) return record

  const state = ensureMockOrderState(record)

  if (!state.fillPollStartedAt) {
    state.fillPollStartedAt = now
    return record
  }

  if (now - state.fillPollStartedAt < FLASH_MARKET_FILL_DELAY_MS) return record

  if (!state.fillPromise) {
    state.fillPromise = executeMarketFill(record)
      .then((filledRecord) => {
        state.record = filledRecord
        state.fillError = null
        return filledRecord
      })
      .catch((error) => {
        state.fillError = error instanceof Error ? error.message : String(error)
        state.rawOrder = {
          ...state.rawOrder,
          orderId: record.orderId,
          status: record.rawStatus,
          normalizedStatus: record.status,
          fillError: state.fillError,
          updatedAt: Date.now()
        }
        return record
      })
      .finally(() => {
        state.fillPromise = undefined
      })
  }

  return state.fillPromise
}

export function refreshOpenOrders() {
  if (openOrderRefresh) return openOrderRefresh

  const openOrders = Object.values(storeOrders()).filter((order) => isOpenStatus(order.status))

  openOrderRefresh = Promise.all(
    openOrders.map(async (order) => {
      try {
        return await advanceMarketFill(order)
      } catch (error) {
        console.error('error refreshing Flash open order', error)
        return order
      }
    })
  ).finally(() => {
    openOrderRefresh = null
  })

  return openOrderRefresh
}

export async function quote(request: FlashQuoteRequest) {
  const { flash, quote } = await buildQuote(request)

  return {
    ...runtime(),
    quote,
    flash
  }
}

export async function submitOrder(request: FlashSubmitOrderRequest) {
  const quoteData = request.quote
    ? {
        chainId: resolveChainId(request),
        targetAsset: request.quote.targetAsset,
        contraAsset: request.quote.contraAsset,
        side: request.quote.side,
        orderType: request.quote.orderType,
        spentAsset: request.quote.spentAsset,
        receiveAsset: request.quote.receiveAsset,
        inputAmount: request.quote.inputAmount,
        outputAmount: request.quote.outputAmount,
        quote: request.quote,
        flash: request.quote.raw
      }
    : await buildQuote(request)
  requireMockChain(quoteData.chainId)

  const now = Date.now()
  const run = runtime()
  const orderId = `mock-order-${randomUUID()}`
  const status: FlashOrderStatus = 'accepted'
  const rawStatusPayload = statusPayload(orderId, status)
  const spentAsset = settlementSpentAsset(quoteData.spentAsset)
  const targetAmount = quoteData.side === 'buy' ? quoteData.outputAmount : quoteData.inputAmount
  const record: FlashOrderRecord = {
    orderId,
    accountAddress: normalizeAddress(request.accountAddress),
    chainId: quoteData.chainId,
    provider: 'flash',
    source: 'flash',
    environment: run.environment,
    profile: run.profile,
    status,
    rawStatus: toRawStatus(status),
    orderType: quoteData.orderType,
    side: quoteData.side,
    targetAsset: quoteData.targetAsset,
    contraAsset: quoteData.contraAsset,
    qty: targetAmount,
    spentAsset,
    spentAmount: quoteData.inputAmount,
    outputAmount: quoteData.outputAmount,
    estimatedOutputAmount: quoteData.outputAmount,
    filledOutputAmount: null,
    averageFillPrice: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: null,
    open: true,
    cancellable: true,
    quoteId: request.quoteId || quoteData.quote.id,
    receiveAsset: quoteData.receiveAsset,
    rate: quoteData.quote.rate,
    rawPayload: {
      ...objectPayload(request.rawPayload),
      quote: quoteData.quote,
      signature: request.orderSignature || request.signature || null
    },
    rawStatusPayload,
    fillHash: null,
    fillTransactionHash: null
  }
  const rawOrder = {
    orderId,
    status: rawStatusPayload.status,
    normalizedStatus: status,
    createdAt: now,
    updatedAt: now,
    quote: quoteData.quote,
    settlement: null
  }

  mockOrders.set(orderId, { record, rawOrder })

  const storedRecord = upsertRecord(record)

  if (storedRecord.orderType === FLASH_MARKET_ORDER_TYPE) startMarketOrderPolling(storedRecord)
  ensureOpenOrderPolling()

  return {
    ...run,
    orderId,
    order: storedRecord,
    raw: rawOrder
  }
}

export async function listOrders(request: FlashListOrdersRequest = {}) {
  const accountAddress = normalizeAddress(request.accountAddress)
  const chainId = request.chainId !== undefined ? Number(request.chainId) : undefined
  const statuses = request.status
    ? new Set(
        (Array.isArray(request.status) ? request.status : [request.status]).map((status) => String(status))
      )
    : undefined
  const orders = (await Promise.all(Object.values(storeOrders()).map((order) => advanceMarketFill(order))))
    .filter((order) => !accountAddress || normalizeAddress(order.accountAddress) === accountAddress)
    .filter((order) => !Number.isInteger(chainId) || Number(order.chainId) === chainId)
    .filter((order) => !statuses || statuses.has(order.status) || statuses.has(order.rawStatus))
    .sort(sortOrders)

  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orders,
    count: orders.length
  }
}

export async function getOrder(request: FlashGetOrderRequest) {
  const order = getRecord(request.orderId)

  if (!order) throw new Error(`Unknown Flash order: ${request.orderId}`)

  const nextOrder = await advanceMarketFill(order)

  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orderId: request.orderId,
    order: nextOrder,
    raw: mockOrders.get(request.orderId)?.rawOrder || nextOrder.rawStatusPayload || null
  }
}

export function cancelOrder(request: FlashCancelOrderRequest) {
  const order = getRecord(request.orderId)

  if (!order) throw new Error(`Unknown Flash order: ${request.orderId}`)
  if (!order.cancellable || !isOpenStatus(order.status)) {
    throw new Error(`Flash order is not cancellable: ${request.orderId}`)
  }

  const nextOrder = recordWithStatus(
    {
      ...order,
      rawPayload: {
        ...objectPayload(order.rawPayload),
        cancelSignature: request.signature || null
      }
    },
    'cancelled'
  )
  const rawOrder = {
    ...(mockOrders.get(request.orderId)?.rawOrder || {}),
    orderId: request.orderId,
    status: nextOrder.rawStatus,
    normalizedStatus: nextOrder.status,
    updatedAt: nextOrder.updatedAt,
    cancelledAt: nextOrder.terminalAt,
    settlement: null
  }

  mockOrders.set(request.orderId, { record: nextOrder, rawOrder })

  const storedRecord = updateRecord(request.orderId, nextOrder)

  resolveOrderNotification(storedRecord)
  stopMarketOrderPolling(request.orderId)
  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orderId: request.orderId,
    cancelled: true,
    order: storedRecord,
    raw: rawOrder
  }
}

export default {
  quote,
  submitOrder,
  listOrders,
  getOrder,
  cancelOrder,
  refreshOpenOrders,
  startOpenOrderPolling,
  stopOpenOrderPolling
}
