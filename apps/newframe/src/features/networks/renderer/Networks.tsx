import { useState } from 'react'

import { chainColorValue } from '../domain/chain/colors'
import { ChainDot } from './ChainDot'
import { useAccountBalances } from '../../../shared/renderer/hooks/useAccountBalances'
import { ChainIcon } from '../../../shared/renderer/ui/ChainIcon'
import { createNetworkRows } from './networkModel'
import { NetworksView } from './NetworksView'
import type { NetworksCapability } from './networksCapability'

export interface NetworksProps {
  capability: Pick<NetworksCapability, 'remove' | 'setNetworkActivation' | 'setPrimaryRpc'>
  onClose: () => void
  onSelectionChange: (chainId: number) => void
  selectedChainId: number
}

export function Networks({ capability, onClose, onSelectionChange, selectedChainId }: NetworksProps) {
  const shared = useAccountBalances()
  const [query, setQuery] = useState('')
  const [kebabChainId, setKebabChainId] = useState(0)
  const [rpcDrafts, setRpcDrafts] = useState<Record<number, string>>({})
  const rows = createNetworkRows({
    balances: shared.balances,
    networks: shared.networks,
    query,
    showTestnets: shared.showTestnets
  })

  const viewRows = rows.map((chain) => ({
    ...chain,
    icon: (
      <ChainIcon
        chainId={chain.chainId}
        networks={shared.networks}
        networksMeta={shared.networksMeta}
        size='large'
      />
    )
  }))

  return (
    <NetworksView
      allTotal={shared.balances.reduce((sum, balance) => sum + balance.totalValue, 0)}
      enabledChainDots={viewRows
        .filter((chain) => chain.on)
        .slice(0, 4)
        .map((chain) => (
          <ChainDot
            key={chain.chainId}
            color={chainColorValue(shared.networksMeta[chain.chainId]?.primaryColor)}
          />
        ))}
      getRpcDraft={(chainId) =>
        rpcDrafts[chainId] ?? shared.networks[chainId]?.connection?.primary?.custom ?? ''
      }
      kebabChainId={kebabChainId}
      onBack={onClose}
      onChangeQuery={setQuery}
      onChangeRpcDraft={(chainId, value) =>
        setRpcDrafts((current) => ({ ...current, [chainId]: value.replace(/\s+/g, '') }))
      }
      onSaveRpc={(chainId) => {
        const url = String(
          rpcDrafts[chainId] ?? shared.networks[chainId]?.connection?.primary?.custom ?? ''
        ).trim()
        if (url) void capability.setPrimaryRpc({ chainId, url })
      }}
      onRemove={(chainId) => {
        void capability.remove({ chainId })
        if (selectedChainId === chainId) onSelectionChange(0)
        setKebabChainId(0)
      }}
      onSelect={(chainId) => {
        onSelectionChange(chainId)
        onClose()
      }}
      onToggleChain={(chainId, enabled) => {
        void capability.setNetworkActivation({ chainId, enabled })
        if (!enabled && selectedChainId === chainId) onSelectionChange(0)
        setKebabChainId(0)
      }}
      onToggleKebab={(chainId) => setKebabChainId((current) => (current === chainId ? 0 : chainId))}
      query={query}
      rows={viewRows}
      selectedChainId={selectedChainId}
      showTestnets={shared.showTestnets}
    />
  )
}
