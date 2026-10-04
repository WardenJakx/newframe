import type { TradeCapability } from './tradeService.ts'
import { TradeView } from './TradeView.tsx'
import { useTradeController } from './useTradeController.ts'

export interface TradeProps {
  assetId?: string | null
  capability: TradeCapability
  chainId?: number
}

export default function Trade({ assetId, capability, chainId }: TradeProps) {
  return <TradeView capability={capability} {...useTradeController({ assetId, capability, chainId })} />
}
