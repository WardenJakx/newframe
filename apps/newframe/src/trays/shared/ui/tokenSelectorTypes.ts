export interface ChainLike {
  name?: string
  [key: string]: unknown
}

export interface ChainMetaLike {
  icon?: string
  image?: {
    base64?: string
    mimeType?: string
  }
  nativeCurrency?: {
    icon?: string
    image?: {
      base64?: string
      mimeType?: string
    }
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
