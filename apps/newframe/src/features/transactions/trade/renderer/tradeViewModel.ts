import type { FlashOrderType, FlashTradeSide } from '../domain/schemas'
import type {
  NetworkLike,
  NetworkMetaLike,
  TokenSelectorItem
} from '../../../../shared/renderer/ui/tokenSelectorTypes'
import type { TradeAssetField } from './tradeReducer'
import type { TradeOrderFields } from './tradeTransaction'

export interface TradeAssetViewModel {
  amount: string
  balanceLabel: string
  balancePercent: number
  border: 'danger' | 'special' | 'subtle'
  canSwitchDirection: boolean
  editable: boolean
  field: TradeAssetField
  intent: string
  intentTone: 'danger' | 'primary' | 'special'
  open: boolean
  outputNotionalLabel: string
  rowsHidden: number
  searchableItems: TokenSelectorItem[]
  selectedId: string
  selectorItems: TokenSelectorItem[]
  symbol: string
}

interface TradeTicketViewModel extends Required<TradeOrderFields> {
  advancedOpen: boolean
  contra: TradeAssetViewModel
  minimumDateTime: string
  orderType: FlashOrderType
  side: FlashTradeSide
  slippage: string
  target: TradeAssetViewModel
  triggerDeltaLabel: string
  triggerHelp: string
}

interface TradeQuoteViewModel {
  estimatedFeeLabel: string
  estimatedImpactDanger: boolean
  estimatedImpactLabel: string
  outputAmountLabel: string
  outputNotionalLabel: string
  targetPriceLabel: string
  targetPricePairLabel: string
}

interface TradeProgressViewModel {
  steps: Array<{
    id: string
    label: string
    status: 'complete' | 'error' | 'idle' | 'pending' | 'required' | 'skipped'
  }>
  status: string
}

interface TradeValidationViewModel {
  error: string
  invalidFields: {
    amount: boolean
    duration: boolean
    expireTime: boolean
    limitPrice: boolean
    maxPriceImpact: boolean
    slippage: boolean
    startTime: boolean
    triggerPrice: boolean
    twapBucketCount: boolean
  }
}

interface TradeActionViewModel {
  enabled: boolean
  label: string
}

export interface TradeViewModel {
  action: TradeActionViewModel
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  progress: TradeProgressViewModel
  quote: TradeQuoteViewModel | null
  ticket: TradeTicketViewModel
  validation: TradeValidationViewModel
}

export interface TradeViewEvents {
  onAssetOpenChange(field: TradeAssetField, open: boolean): void
  onBalancePercentChange(field: TradeAssetField, value: number): void
  onClose(): void
  onInputAmountChange(inputAmount: string): void
  onOrderFieldChange(field: keyof TradeOrderFields, value: string): void
  onOrderTypeChange(orderType: FlashOrderType): void
  onReview(): void
  onSelectAsset(field: TradeAssetField, assetId: string): void
  onShowMoreAssets(field: TradeAssetField): void
  onSlippageChange(slippage: string): void
  onTimeInForceChange(timeInForce: 'gtc' | 'gtt'): void
  onToggleAdvanced(): void
  onToggleSide(): void
}
