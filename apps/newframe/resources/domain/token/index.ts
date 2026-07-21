import { NATIVE_CURRENCY } from '../../constants'
import { persistedImageSource } from '../image'

import type { Token, TokenCatalog, TokenImage, TokenRecord, WithTokenId } from '../../../main/store/state'

export function toTokenId(token: WithTokenId) {
  return `${Number(token.chainId)}:${token.address.toLowerCase()}`
}

export function tokenImageDataUri(image?: TokenImage) {
  return persistedImageSource(image)
}

export function tokenImageSource(token?: Pick<Token, 'image'>) {
  return tokenImageDataUri(token?.image)
}

export function tokenForId(catalog: TokenCatalog, tokenId: string) {
  return catalog.byId[tokenId]
}

export function tokensForAccount(catalog: TokenCatalog, account: string) {
  const accountIds = catalog.accountTokenIds[account.toLowerCase()] || []
  const ids = new Set([
    ...Object.values(catalog.byId)
      .filter((token) => token.custom || token.curated)
      .map(toTokenId),
    ...accountIds
  ])

  return [...ids].map((id) => catalog.byId[id]).filter(Boolean)
}

export function customTokens(catalog: TokenCatalog) {
  return Object.values(catalog.byId).filter((token) => token.custom)
}

export function selectableTokens(catalog: TokenCatalog) {
  return Object.values(catalog.byId).filter((token) => token.custom || token.curated)
}

export function tokenFromBalance(
  catalog: TokenCatalog,
  balance: WithTokenId,
  nativeCurrency?: { decimals?: number; icon?: string; name?: string; symbol?: string }
): TokenRecord | undefined {
  if (balance.address === NATIVE_CURRENCY && nativeCurrency) {
    return {
      address: balance.address,
      chainId: balance.chainId,
      custom: false,
      curated: true,
      decimals: nativeCurrency.decimals ?? 18,
      logoURI: nativeCurrency.icon || '',
      name: nativeCurrency.name || '',
      sources: ['bundled'],
      symbol: nativeCurrency.symbol || '',
      updatedAt: 0
    }
  }

  return catalog.byId[toTokenId(balance)]
}
