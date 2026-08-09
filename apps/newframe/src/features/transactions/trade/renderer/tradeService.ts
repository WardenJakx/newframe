import type {
  CommandMap,
  CommandResult,
  QueryMap,
  ResultForQuery
} from '../../../../app/contracts/operations'
import type { NewframeHost } from '../../../../platform/ipc/contract/ipc'
import type { TokenImageCapability } from '../../../../shared/renderer/capabilities'
import type { MarketTradeQuoteRequest } from './tradeTransaction'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type TradePrepareInput = WithoutType<CommandMap['trade.prepare']>
type TradeSubmitInput = WithoutType<CommandMap['trade.submit']>
type TradeQuoteSuccess = Extract<ResultForQuery<QueryMap['flash.quote']>, { ok: true }>

export interface TradeCapability extends TokenImageCapability {
  quote(request: MarketTradeQuoteRequest): Promise<TradeQuoteSuccess>
  prepare(input: TradePrepareInput): Promise<CommandResult>
  submit(input: TradeSubmitInput): Promise<CommandResult>
  release(): Promise<CommandResult>
  close(): Promise<CommandResult>
}

type TradeHost = Pick<NewframeHost, 'executeCommand' | 'executeQuery'>

export function createTradeCapability(host: TradeHost): TradeCapability {
  return {
    quote: async (request) => {
      const { accountAddress: _accountAddress, ...wireRequest } = request
      const result = await host.executeQuery({ type: 'flash.quote', request: wireRequest })
      if (!result.ok) throw new Error(result.message || 'Flash quote failed.')

      return result
    },
    prepare: (input) => host.executeCommand({ type: 'trade.prepare', ...input }),
    submit: (input) => host.executeCommand({ type: 'trade.submit', ...input }),
    release: () => host.executeCommand({ type: 'trade.release' }),
    close: () => host.executeCommand({ type: 'sidetray.close' }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
