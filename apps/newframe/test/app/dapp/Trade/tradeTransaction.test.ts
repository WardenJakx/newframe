import { internalDappOriginId } from '../../../../app/dapp/dappOrigin'
import {
  buildMarketTradeQuoteRequest,
  buildTradeActionPayload,
  buildTradeSignaturePayload,
  cleanTradeAmount,
  marketTradeQuoteRequestKey,
  TRADE_DEFAULT_SLIPPAGE
} from '../../../../app/dapp/Trade/tradeTransaction'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET,
  type FlashQuote
} from '../../../../resources/domain/flash'

describe('tradeTransaction', () => {
  it('cleans amounts and builds market quote requests with optional fields only when needed', () => {
    const base = {
      accountAddress: '0xsender',
      contraAsset: FLASH_USDC_ASSET,
      inputAmount: ' 1,200.50 ',
      quickTrade: false,
      side: 'sell' as const,
      slippage: TRADE_DEFAULT_SLIPPAGE,
      targetAsset: FLASH_WETH_ASSET
    }

    expect(cleanTradeAmount(base.inputAmount)).toBe('1200.50')
    expect(buildMarketTradeQuoteRequest(base)).toEqual({
      accountAddress: '0xsender',
      chainId: FLASH_ANVIL_CHAIN_ID,
      contraAsset: FLASH_USDC_ASSET,
      contraChain: FLASH_ANVIL_CHAIN_ID,
      inputAmount: '1200.50',
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: '1200.50',
      side: 'sell',
      targetAsset: FLASH_WETH_ASSET,
      targetChain: FLASH_ANVIL_CHAIN_ID
    })

    expect(
      buildMarketTradeQuoteRequest({
        ...base,
        quickTrade: true,
        slippage: '1.00'
      })
    ).toMatchObject({
      quickTrade: true,
      slippage: '1.00'
    })
  })

  it('keys quote requests by account, assets, side, amount, and optional settings', () => {
    const first = buildMarketTradeQuoteRequest({
      accountAddress: '0xsender',
      contraAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      quickTrade: false,
      side: 'sell',
      slippage: TRADE_DEFAULT_SLIPPAGE,
      targetAsset: FLASH_WETH_ASSET
    })!
    const second = buildMarketTradeQuoteRequest({
      ...first,
      accountAddress: '0xother',
      quickTrade: true,
      slippage: '1.00'
    })!

    expect(marketTradeQuoteRequestKey(first)).not.toBe(marketTradeQuoteRequestKey(second))
  })

  it('builds provider transaction payloads with the shared internal origin', () => {
    expect(
      buildTradeActionPayload({
        accountAddress: '0xsender',
        action: {
          id: 'approval',
          kind: 'approve',
          label: 'Approve WETH',
          asset: FLASH_WETH_ASSET,
          amount: '1',
          amountRaw: '1000000000000000000',
          tx: {
            chainId: FLASH_ANVIL_CHAIN_ID,
            to: '0xspender',
            data: '0x095ea7b3'
          }
        },
        id: 123
      })
    ).toEqual({
      chainIdNumber: FLASH_ANVIL_CHAIN_ID,
      payload: {
        id: 123,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        chainId: '0x7a69',
        params: [
          {
            chainId: '0x7a69',
            to: '0xspender',
            data: '0x095ea7b3',
            from: '0xsender',
            value: '0x0'
          }
        ],
        _origin: internalDappOriginId
      }
    })
  })

  it('finds typed data in Flash payloads and builds sign payloads', () => {
    const quote = {
      id: 'quote-1',
      side: 'sell',
      orderType: FLASH_MARKET_ORDER_TYPE,
      targetAsset: FLASH_WETH_ASSET,
      contraAsset: FLASH_USDC_ASSET,
      spentAsset: FLASH_WETH_ASSET,
      receiveAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      outputAmount: '2400',
      steps: []
    } satisfies FlashQuote
    const typedData = {
      domain: { chainId: FLASH_ANVIL_CHAIN_ID },
      message: { quoteId: quote.id },
      primaryType: 'Order',
      types: { Order: [] }
    }

    expect(
      buildTradeSignaturePayload({
        accountAddress: '0xsender',
        flashPayload: { actions: { evm: { orderTypedData: typedData } } },
        id: 456,
        quote
      })
    ).toEqual({
      chainIdNumber: FLASH_ANVIL_CHAIN_ID,
      payload: {
        id: 456,
        jsonrpc: '2.0',
        method: 'eth_signTypedData_v4',
        chainId: '0x7a69',
        params: ['0xsender', JSON.stringify(typedData)],
        _origin: internalDappOriginId
      }
    })
  })
})
