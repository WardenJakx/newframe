import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { AddressIdentity } from '../../../shared/renderer/ui/AddressIdentity'
import { ChainIcon } from '../../../shared/renderer/ui/ChainIcon'
import type { SafeProposalSimulation } from '../../accounts/domain/safe'
import { persistedImageSource } from '../../asset-data/domain/image'
import type { RequestRendererCapabilities } from './requestCapabilities'
import type { SafePreview } from './SafeProposalDetailsView'

export function useSafeQueue({
  accountId,
  capabilities
}: {
  accountId: string
  capabilities: Pick<RequestRendererCapabilities, 'safe' | 'external'>
}) {
  const { safe, networks, metadata, accounts, currentProfile } = useWalletSelector(
    useShallow((state) => ({
      safe: state.accounts[accountId]?.safe,
      accounts: state.accounts,
      currentProfile: state.currentProfile,
      networks: state.networks.ethereum,
      metadata: state.networksMeta.ethereum
    }))
  )
  const hasSafe = !!safe && Object.keys(safe).length > 0
  const [selection, setSelection] = useState<{ chainId: number; hash: string; lifetime: number } | null>(null)
  const selectionLifetime = useRef(0)
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
  const chainId = deployment?.chainId
  const safeTxHash = proposal?.safeTxHash
  // Projections may recreate objects without changing the transaction being reviewed.
  const scope =
    deployment && proposal
      ? JSON.stringify([
          accountId,
          currentProfile,
          accounts[accountId]?.created,
          selection?.lifetime,
          chainId,
          deployment.address,
          deployment.configuration.nonce,
          deployment.configuration.threshold,
          deployment.configuration.owners,
          deployment.configuration.version,
          safeTxHash,
          proposal.safe,
          proposal.nonce,
          proposal.to,
          proposal.value,
          proposal.operation,
          proposal.data,
          proposal.safeTxGas,
          proposal.baseGas,
          proposal.gasPrice,
          proposal.gasToken,
          proposal.refundReceiver
        ])
      : ''
  const [preview, setPreview] = useState<{ scope: string; generation: number; result: SafePreview }>({
    scope: '',
    generation: 0,
    result: { status: 'loading' }
  })
  if (preview.scope !== scope) {
    setPreview({ scope, generation: preview.generation + 1, result: { status: 'loading' } })
  }
  const generation = preview.generation
  useEffect(() => {
    if (!scope || chainId === undefined || !safeTxHash) return
    let active = true
    const receive = (result: SafeProposalSimulation) => {
      if (active)
        setPreview((current) =>
          current.scope === scope && current.generation === generation ? { ...current, result } : current
        )
    }
    void capabilities.safe.simulate({ accountId, chainId, safeTxHash }).then(receive, (error: unknown) => {
      receive({
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Could not load Safe preview.'
      })
    })
    return () => {
      active = false
    }
  }, [accountId, capabilities.safe, chainId, generation, safeTxHash, scope])
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
  const networkIcon = deployment ? persistedImageSource(metadata[deployment.chainId]?.image) : undefined
  return {
    hasSafe,
    review:
      deployment && proposal
        ? {
            renderAddress,
            deployment,
            proposal,
            simulation: preview.scope === scope ? preview.result : { status: 'loading' as const },
            capabilities,
            networkName: network?.name || `Chain ${deployment.chainId}`,
            networkIcon,
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
      onSelect: (chainId: number, hash: string) =>
        setSelection({ chainId, hash, lifetime: ++selectionLifetime.current }),
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
