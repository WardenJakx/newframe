import link from '../../shared/link'
import type { MarketTradeQuoteRequest } from './tradeTransaction'

export function closeTrade() {
  void link.executeCommand({ type: 'sidetray.close' })
}

export async function flashQuote(request: MarketTradeQuoteRequest) {
  const { accountAddress: _accountAddress, ...wireRequest } = request
  const result = await link.executeQuery({
    type: 'flash.quote',
    request: wireRequest
  })
  if (!result.ok) throw new Error(result.message || 'Flash quote failed.')
  return result
}

export function prepareTrade(operationId: string, quoteId: string, action: 'wrap' | 'approve') {
  return link.executeCommand({ type: 'trade.prepare', operationId, quoteId, action })
}

export function submitTrade(operationId: string, quoteId: string) {
  return link.executeCommand({ type: 'trade.submit', operationId, quoteId })
}

export async function releaseTrade() {
  try {
    await link.executeCommand({ type: 'trade.release' })
  } catch {
    // Owner-scoped quote cleanup is best-effort during renderer teardown.
  }
}
