import { useMemo } from 'react'

import type { MainTrayProjection } from '../../../../../platform/state-sync/contract/projections.ts'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector.tsx'
import { resolveAssetRate } from '../../../../asset-data/domain/asset/index.ts'
import type { AssetRateReference } from '../../../../asset-data/domain/state/rate.ts'

type AccountRequests = MainTrayProjection['accounts'][string]['requests']
type ChainRecord = MainTrayProjection['chains']['ethereum']
type ChainMetadataRecord = MainTrayProjection['chainsMeta']['ethereum']
const EMPTY_ACCOUNT_REQUESTS: AccountRequests = {}
const EMPTY_CHAIN: Partial<ChainRecord[number]> = {}
const EMPTY_CHAIN_METADATA: Partial<ChainMetadataRecord[number]> = {}
const selectEthereumChains = (state: MainTrayProjection) => state.chains.ethereum
const selectEthereumChainMetadata = (state: MainTrayProjection) => state.chainsMeta.ethereum
const selectOrigins = (state: MainTrayProjection) => state.origins
const selectTokens = (state: MainTrayProjection) => state.tokens

export function useAccountRequests(accountId: string) {
  const selector = useMemo(
    () => (state: MainTrayProjection) =>
      (state.accounts as Partial<typeof state.accounts>)[accountId]?.requests ?? EMPTY_ACCOUNT_REQUESTS,
    [accountId]
  )
  return useWalletSelector(selector)
}

export function useChain(type: string, chainId: string | number) {
  const selector = useMemo(
    () => (state: MainTrayProjection) =>
      type === 'ethereum'
        ? ((state.chains.ethereum as Partial<typeof state.chains.ethereum>)[Number(chainId)] ?? EMPTY_CHAIN)
        : EMPTY_CHAIN,
    [chainId, type]
  )
  return useWalletSelector(selector)
}

export function useChainMetadata(type: string, chainId: string | number) {
  const selector = useMemo(
    () => (state: MainTrayProjection) =>
      type === 'ethereum'
        ? ((state.chainsMeta.ethereum as Partial<typeof state.chainsMeta.ethereum>)[Number(chainId)] ??
          EMPTY_CHAIN_METADATA)
        : EMPTY_CHAIN_METADATA,
    [chainId, type]
  )
  return useWalletSelector(selector)
}

export function useEthereumChains() {
  return useWalletSelector(selectEthereumChains)
}

export function useEthereumChainMetadata() {
  return useWalletSelector(selectEthereumChainMetadata)
}

export function useOrigins() {
  return useWalletSelector(selectOrigins)
}

export function useTokens() {
  return useWalletSelector(selectTokens)
}

export function useOriginName(originId: string) {
  const selector = useMemo(
    () => (state: MainTrayProjection) => state.origins[originId]?.name || originId,
    [originId]
  )
  return useWalletSelector(selector)
}

export function useAccountIdentity(idOrAddress?: string) {
  const normalized = idOrAddress?.toLowerCase()
  const selector = useMemo(
    () => (state: MainTrayProjection) => {
      if (!idOrAddress) {
        return undefined
      }
      const accounts = state.accounts
      const sparseAccounts: Record<string, (typeof accounts)[string] | undefined> = accounts
      return (
        sparseAccounts[idOrAddress] ??
        Object.values(accounts).find((account) => account.address.toLowerCase() === normalized)
      )
    },
    [idOrAddress, normalized]
  )
  return useWalletSelector(selector)
}

export function useAssetRate(asset: AssetRateReference) {
  const { address, chainId, nativeTicker } = asset
  const selector = useMemo(
    () => (state: MainTrayProjection) =>
      resolveAssetRate({ address, chainId, nativeTicker }, state.assetRates),
    [address, chainId, nativeTicker]
  )
  return useWalletSelector(selector)
}
