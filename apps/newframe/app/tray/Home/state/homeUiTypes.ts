import type { DisplayedBalance } from '../../../../resources/domain/balance'

export type HomeSection = 'positions' | 'activity' | 'orders'

export interface ProposedChain {
  id?: string | number
  chainId?: string | number
  name?: string
  symbol?: string
  primaryRpc?: string
  explorer?: string
  [key: string]: unknown
}

export interface PendingAddChain {
  chain?: ProposedChain
  request?: { chain?: ProposedChain; handlerId?: string }
  homeCommandId?: number
}

export interface PendingCustomToken {
  address: string
  chainId: number
  decimals?: number
  logoURI?: string
  name?: string
  symbol?: string
}

export type HomeOverlay =
  | { type: 'none' }
  | { type: 'menu' }
  | { type: 'accounts'; showAddAccounts?: boolean; newAccountType?: string; selectedSigner?: string }
  | { type: 'networks' }
  | { type: 'settings' }
  | { type: 'about' }
  | { type: 'requests' }
  | { type: 'dapps' }
  | { type: 'tokens'; initialToken?: PendingCustomToken }
  | { type: 'addChain'; pending: PendingAddChain }
  | { type: 'asset'; asset: DisplayedBalance }
  | { type: 'activity'; activityId: string }
  | { type: 'order'; orderId: string }
  | { type: 'receive'; accountId: string }

export interface HomeUiState {
  section: HomeSection
  selectedChainId: number
  overlay: HomeOverlay
  setSection: (section: HomeSection) => void
  setSelectedChainId: (chainId: number) => void
  openOverlay: (overlay: Exclude<HomeOverlay, { type: 'none' }>) => void
  closeOverlay: () => void
}
