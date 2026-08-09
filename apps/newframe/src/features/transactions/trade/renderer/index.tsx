import { TradeView } from './TradeView'
import type { TradeCapability } from './tradeService'
import { useTradeController } from './useTradeController'

export interface TradeProps {
  assetId?: string | null
  capability: TradeCapability
  chainId?: number
}

export default function Trade({ assetId, capability, chainId }: TradeProps) {
  return <TradeView capability={capability} {...useTradeController({ assetId, capability, chainId })} />
}
