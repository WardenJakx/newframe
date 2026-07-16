import link from '../../../resources/link'
import type {
  FlashQuoteRequest,
  FlashSubmitOrder,
  TypedDataSignCommand
} from '../../../resources/bridge/operations'
import type { MarketTradeQuoteRequest, TradeSubmitRequest } from './tradeTransaction'

export function closeTrade() {
  void link.executeCommand({ type: 'sidetray.close' })
}

export function submitTransaction(
  chainId: number,
  transaction: { to: string; data?: string; value?: string },
  idempotencyKey: string
) {
  return link.executeCommand({ type: 'transaction.submit', idempotencyKey, chainId, transaction })
}

export function signTypedData(chainId: number, typedData: TypedDataSignCommand['typedData']) {
  return link.executeCommand({ type: 'typedData.signV4', chainId, typedData })
}

export async function flashQuote(request: MarketTradeQuoteRequest) {
  const {
    accountAddress: _accountAddress,
    contraChain: _contraChain,
    targetChain: _targetChain,
    ...wireRequest
  } = request
  const result = await link.executeQuery({
    type: 'flash.quote',
    request: wireRequest as FlashQuoteRequest
  })
  if (!result.ok) throw new Error(result.message || 'Flash quote failed.')

  return { quote: result.quote, flash: result.flash }
}

export async function flashSubmitOrder(request: TradeSubmitRequest) {
  const {
    accountAddress: _accountAddress,
    contraChain: _contraChain,
    targetChain: _targetChain,
    ...wireOrder
  } = request
  const result = await link.executeCommand({
    type: 'flash.submit',
    order: wireOrder as FlashSubmitOrder
  })
  if (!result.ok) throw new Error(result.message || 'Flash order submission failed.')

  return { orderId: result.orderId }
}
