import { useMemo } from 'react'

import type { WalletRendererState } from '../../../../resources/state/projections'
import { useWalletSelector } from '../../../state/useAppSelector'

type AccountRequests = WalletRendererState['accounts'][string]['requests']
type NetworkRecord = WalletRendererState['networks']['ethereum']
type NetworkMetadataRecord = WalletRendererState['networksMeta']['ethereum']
const EMPTY_ACCOUNT_REQUESTS: AccountRequests = {}
const EMPTY_NETWORK: Partial<NetworkRecord[number]> = {}
const EMPTY_NETWORK_METADATA: Partial<NetworkMetadataRecord[number]> = {}
const selectEthereumNetworks = (state: WalletRendererState) => state.networks.ethereum
const selectEthereumNetworkMetadata = (state: WalletRendererState) => state.networksMeta.ethereum
const selectOrigins = (state: WalletRendererState) => state.origins
const selectPanelNavigation = (state: WalletRendererState) => state.windows.panel.nav

export function useAccountRequests(accountId: string) {
  const selector = useMemo(
    () => (state: WalletRendererState) => state.accounts[accountId]?.requests || EMPTY_ACCOUNT_REQUESTS,
    [accountId]
  )
  return useWalletSelector(selector)
}

export function useNetwork(type: string, chainId: string | number) {
  const selector = useMemo(
    () => (state: WalletRendererState) =>
      type === 'ethereum' ? state.networks.ethereum[Number(chainId)] || EMPTY_NETWORK : EMPTY_NETWORK,
    [chainId, type]
  )
  return useWalletSelector(selector)
}

export function useNetworkMetadata(type: string, chainId: string | number) {
  const selector = useMemo(
    () => (state: WalletRendererState) =>
      type === 'ethereum'
        ? state.networksMeta.ethereum[Number(chainId)] || EMPTY_NETWORK_METADATA
        : EMPTY_NETWORK_METADATA,
    [chainId, type]
  )
  return useWalletSelector(selector)
}

export function useEthereumNetworks() {
  return useWalletSelector(selectEthereumNetworks)
}

export function useEthereumNetworkMetadata() {
  return useWalletSelector(selectEthereumNetworkMetadata)
}

export function useOrigins() {
  return useWalletSelector(selectOrigins)
}

export function useOriginName(originId: string) {
  const selector = useMemo(
    () => (state: WalletRendererState) => state.origins[originId]?.name || originId,
    [originId]
  )
  return useWalletSelector(selector)
}

export function useRate(address: string) {
  const selector = useMemo(() => (state: WalletRendererState) => state.rates[address], [address])
  return useWalletSelector(selector)
}

export function usePanelNavigation() {
  return useWalletSelector(selectPanelNavigation)
}
