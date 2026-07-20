export interface NetworkLike {
  name?: string
  [key: string]: unknown
}

export interface NetworkMetaLike {
  icon?: string
  nativeCurrency?: {
    icon?: string
    name?: string
    symbol?: string
  }
  primaryColor?: string
  [key: string]: unknown
}

export type ChainTokenIconSize = 'sm' | 'md'

export interface TokenSelectorItem {
  id: string
  symbol: string
  searchText?: string
  amountLabel: string
  notionalLabel: string
  chainId: number
  logoURI?: string
  rightSubLabel?: string
}
