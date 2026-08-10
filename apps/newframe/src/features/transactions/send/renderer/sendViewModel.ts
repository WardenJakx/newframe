import type {
  NetworkLike,
  NetworkMetaLike,
  TokenSelectorItem
} from '../../../../shared/renderer/ui/tokenSelectorTypes'
import type { SendRecipient } from './sendReducer'

export type SendAccountViewModel = SendRecipient

export interface SendSelectedAssetViewModel {
  address: string
  balance: string
  chainId: number
  decimals: number
  displayBalance: string
  symbol: string
}

export interface SendSubmissionViewModel {
  error: string
  status: string
  submitting: boolean
}

interface SendValidationViewModel {
  error: string
  proceedEnabled: boolean
}

export interface SendViewModel {
  amount: string
  fiatValue: string
  firstTimeRecipient: boolean
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  recipient: SendAccountViewModel | null
  recipientAccounts: SendAccountViewModel[]
  recipientInput: string
  recipientOpen: boolean
  rowsHidden: number
  selectedAsset: SendSelectedAssetViewModel | null
  selectedAssetKey: string
  submission: SendSubmissionViewModel
  tokenItems: TokenSelectorItem[]
  searchableTokenItems: TokenSelectorItem[]
  tokenOpen: boolean
  validation: SendValidationViewModel
}

export interface SendViewEvents {
  onAmountChange(amount: string): void
  onClearRecipient(): void
  onClose(): void
  onRecipientInputChange(recipient: string): void
  onSelectAsset(assetId: string): void
  onSelectRecipient(recipient: SendAccountViewModel): void
  onSetMax(): void
  onShowMoreTokens(): void
  onSubmit(): void
  onTokenPickerOpenChange(open: boolean): void
  onToggleRecipients(): void
}
