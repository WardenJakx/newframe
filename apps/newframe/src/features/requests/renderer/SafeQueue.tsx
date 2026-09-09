import { AddressIdentity } from '../../../shared/renderer/ui/AddressIdentity'
import { ChainIcon } from '../../../shared/renderer/ui/ChainIcon'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import type { RequestRendererCapabilities } from './requestCapabilities'

export function useSafeQueue({
  accountId,
  capabilities
}: {
  accountId: string
  capabilities: Pick<RequestRendererCapabilities, 'safe' | 'external'>
}) {
  const { safe, networks, metadata, accounts } = useWalletSelector(
    useShallow((state) => ({
      safe: state.accounts[accountId]?.safe,
      accounts: state.accounts,
      networks: state.networks.ethereum,
      metadata: state.networksMeta.ethereum
    }))
  )
  const hasSafe = !!safe && Object.keys(safe).length > 0
  const [selection, setSelection] = useState<{ chainId: number; hash: string } | null>(null)
  const [refreshing, setRefreshing] = useState(hasSafe)
  const [refreshError, setRefreshError] = useState<string>()
  const refreshScope = useRef<object | null>(null)
  useEffect(() => {
    refreshScope.current = {}
    if (!hasSafe) return
    let active = true
    void capabilities.safe
      .refresh({ accountId })
      .then((result) => {
        if (active && !result.ok) setRefreshError(result.message || 'Could not refresh Safe queue')
      })
      .catch((error: unknown) => {
        if (active) setRefreshError(error instanceof Error ? error.message : 'Could not refresh Safe queue')
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })
    return () => {
      active = false
      refreshScope.current = null
    }
  }, [accountId, capabilities.safe, hasSafe])
  const deployment = selection ? safe?.[String(selection.chainId)] : undefined
  const proposal = deployment?.pending?.find((item) => item.safeTxHash === selection?.hash)
  if (selection && !proposal) setSelection(null)
  const renderAddress = (address: string) => (
    <AddressIdentity
      address={address}
      clipboard={capabilities.external}
      nickname={
        Object.values(accounts).find((account) => account.address.toLowerCase() === address.toLowerCase())
          ?.name
      }
    />
  )
  const networkIcons = Object.fromEntries(
    Object.values(safe ?? {}).map((deployment) => [
      deployment.chainId,
      <ChainIcon
        key={deployment.chainId}
        chainId={deployment.chainId}
        networks={networks}
        networksMeta={metadata}
      />
    ])
  )
  const network = deployment ? networks[deployment.chainId] : undefined
  const currency = deployment ? metadata[deployment.chainId]?.nativeCurrency : undefined
  return {
    hasSafe,
    review:
      deployment && proposal
        ? {
            renderAddress,
            deployment,
            proposal,
            capabilities,
            networkName: network?.name || `Chain ${deployment.chainId}`,
            symbol: currency?.symbol || network?.symbol || 'native',
            decimals: currency?.decimals ?? 18
          }
        : undefined,
    back: () => setSelection(null),
    queue: {
      networkIcons,
      deployments: Object.values(safe ?? {}),
      networkNames: Object.fromEntries(Object.entries(networks).map(([id, network]) => [id, network.name])),
      currencies: Object.fromEntries(
        Object.entries(networks).map(([id, network]) => [
          id,
          {
            symbol: metadata[Number(id)]?.nativeCurrency?.symbol || network.symbol || 'native',
            decimals: metadata[Number(id)]?.nativeCurrency?.decimals ?? 18
          }
        ])
      ),
      refreshing,
      refreshError,
      onSelect: (chainId: number, hash: string) => setSelection({ chainId, hash }),
      onRefresh: () => {
        const scope = refreshScope.current
        setRefreshing(true)
        setRefreshError(undefined)
        void capabilities.safe
          .refresh({ accountId, force: true })
          .then((result) => {
            if (scope === refreshScope.current && !result.ok)
              setRefreshError(result.message || 'Could not refresh requests')
          })
          .catch((error: unknown) => {
            if (scope === refreshScope.current)
              setRefreshError(error instanceof Error ? error.message : 'Could not refresh requests')
          })
          .finally(() => {
            if (scope === refreshScope.current) setRefreshing(false)
          })
      }
    }
  }
}
