import link from '../../../resources/link'
import { buildInternalDappOrigin, internalDappOriginId } from '../dappOrigin'
import type { MarketTradeQuoteRequest, ProviderSendPayload } from './tradeTransaction'

export function closeTrade() {
  link.send('frame:close')
}

export function initTradeOrigin(chainId: number) {
  link.send('tray:action', 'initOrigin', internalDappOriginId, buildInternalDappOrigin(chainId))
}

export function providerSend(payload: ProviderSendPayload) {
  return new Promise<any>((resolve) => {
    link.rpc('providerSend', payload, (response: any) => {
      resolve(response)
    })
  })
}

export function flashQuote(request: MarketTradeQuoteRequest) {
  return new Promise<any>((resolve, reject) => {
    link.rpc('flashQuote', request, (err: any, result: any) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

export function flashSubmitOrder(request: unknown) {
  return new Promise<any>((resolve, reject) => {
    link.rpc('flashSubmitOrder', request, (err: any, result: any) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}
