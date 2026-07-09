import { Interface, JsonRpcProvider, MaxUint256, Wallet, getAddress, isAddress, parseUnits } from 'ethers'

import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_NATIVE_ETH_ASSET,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET,
  getReceiveAsset,
  getSpentAsset,
  toFlashApiAssetAddress,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteFee,
  type FlashStep,
  type FlashTradeSide
} from '../../resources/domain/flash'

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

const quotes = new Map<string, LocalQuoteRecord>()
const orders = new Map<string, LocalOrderRecord>()

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

function formatAmount(value: number, asset: FlashAsset) {
  if (!Number.isFinite(value) || value <= 0) return '0'

  const decimals = asset.symbol.toUpperCase() === 'USDC' ? 2 : 6

  return value
    .toFixed(decimals)
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
      label: orderType === FLASH_MARKET_ORDER_TYPE ? 'Sign quote' : 'Sign order',
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
  const qty = cleanAmount(body.qty || body.inputAmount)
  const amount = amountNumber(qty)

  if (!amount) throw new Error('Local Flash quote requires a positive qty')

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
  const feeAmount = formatAmount(amount * 0.0008, spentAsset)
  const rateAmount = formatAmount(spentUsdRate / receiveUsdRate, receiveAsset)
  const quoteId = `local-quote-${crypto.randomUUID()}`
  const typedData = orderTypedData({ accountAddress, orderType, quoteId, qty, side, spentAsset })
  const fees: FlashQuoteFee[] = [
    {
      label: 'Local Flash fee',
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
    inputAmount: qty,
    outputAmount,
    rate: `1 ${spentAsset.symbol} = ${rateAmount || '0'} ${receiveAsset.symbol}`,
    fees,
    steps: buildSteps({ approvalAction, orderType, spentAsset, wrapAction }),
    actions: {
      wrap: wrapAction,
      approval: approvalAction
    },
    expiresAt: new Date(Date.now() + 30_000).toISOString()
  }
  const response = {
    quoteId,
    id: quoteId,
    from: {
      chain: LOCAL_CHAIN_SLUG,
      asset: toFlashApiAssetAddress(spentAsset),
      amount: qty
    },
    to: {
      chain: LOCAL_CHAIN_SLUG,
      asset: toFlashApiAssetAddress(receiveAsset),
      amount: outputAmount
    },
    inputAmount: qty,
    outputAmount,
    estimatedOutputAmount: outputAmount,
    rate: quote.rate,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    fees,
    wrap: wrapAction
      ? {
          amount: wrapAction.amount,
          amountRaw: wrapAction.amountRaw,
          evmTx: wrapAction.tx
        }
      : null,
    evm: {
      approveTx: approvalAction?.tx || null,
      orderTypedData: typedData
    },
    approval: approvalAction
      ? {
          amount: approvalAction.amount,
          amountRaw: approvalAction.amountRaw,
          spender: approvalAction.spender,
          evmTx: approvalAction.tx
        }
      : null,
    expiresAt: quote.expiresAt,
    local: true
  }

  quote.raw = response
  quotes.set(quoteId, { body, quote, response })

  return response
}

function orderResponse(order: LocalOrderRecord) {
  return {
    ...order,
    normalizedStatus: order.status,
    targetAsset: order.quote.targetAsset,
    contraAsset: order.quote.contraAsset,
    spentAsset: order.quote.spentAsset,
    receiveAsset: order.quote.receiveAsset,
    inputAmount: order.quote.inputAmount,
    outputAmount: order.quote.outputAmount,
    estimatedOutputAmount: order.quote.outputAmount,
    filledOutputAmount: order.filledOutputAmount || null,
    fillTransactionHash: order.fillTransactionHash || null
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

  orders.set(orderId, order)

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

    orders.set(orderId, {
      ...order,
      cancellable: false,
      fillTransactionHash: tx.hash,
      filledOutputAmount: quote.outputAmount,
      open: false,
      status: 'filled',
      updatedAt: nowIso()
    })
  } catch (error) {
    orders.set(orderId, {
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
  const funder = String(url.searchParams.get('funderAddress') || url.searchParams.get('account') || '')
    .trim()
    .toLowerCase()
  const chain = String(url.searchParams.get('chain') || url.searchParams.get('chainId') || '').trim()
  const statuses = new Set(url.searchParams.getAll('status').map((status) => status.toLowerCase()))

  return Array.from(orders.values()).filter((order) => {
    if (funder && order.accountAddress.toLowerCase() !== funder) return false
    if (chain && chain !== order.chain && Number(chain) !== order.chainId) return false
    if (statuses.size && !statuses.has(order.status)) return false
    return true
  })
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

      if (!order) return errorResponse(`Unknown local Flash order: ${orderRoute.orderId}`, 404)

      return jsonResponse(orderResponse(order))
    }

    if (orderRoute && req.method === 'POST' && orderRoute.action === 'cancel') {
      const order = orders.get(orderRoute.orderId)

      if (!order) return errorResponse(`Unknown local Flash order: ${orderRoute.orderId}`, 404)
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

      orders.set(order.orderId, nextOrder)

      return jsonResponse({ orderId: nextOrder.orderId, order: orderResponse(nextOrder) })
    }

    return errorResponse('Not found', 404)
  } catch (error) {
    return errorResponse(error, 500)
  }
}
