import { useState } from 'react'

import link from '../../../../../resources/link'
import { chainColorValue } from '../../../../../resources/colors'
import { ChainDot } from '../../../../../resources/Components/ChainDot'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ChainIcon } from '../../components/ChainIcon'
import { createNetworkRows } from './networkModel'
import { NetworksView } from './NetworksView'

export function Networks() {
  const shared = useAccountBalances()
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSelectedChainId = useHomeUiStore((state) => state.setSelectedChainId)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
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
      onBack={closeOverlay}
      onChangeQuery={setQuery}
      onChangeRpcDraft={(chainId, value) =>
        setRpcDrafts((current) => ({ ...current, [chainId]: value.replace(/\s+/g, '') }))
      }
      onSaveRpc={(chainId) => {
        const url = String(
          rpcDrafts[chainId] ?? shared.networks[chainId]?.connection?.primary?.custom ?? ''
        ).trim()
        if (url) void link.executeCommand({ type: 'network.primary-rpc-set', chainId, url })
      }}
      onSelect={(chainId) => {
        setSelectedChainId(chainId)
        closeOverlay()
      }}
      onToggleChain={(chainId, enabled) => {
        void link.executeCommand({ type: 'network.activation-set', chainId, enabled })
        if (!enabled && selectedChainId === chainId) setSelectedChainId(0)
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
