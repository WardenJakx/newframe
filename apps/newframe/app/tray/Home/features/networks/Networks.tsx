import React, { useEffect, useRef, useState } from 'react'

import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { cachedImageUrl, isCachedImageReference } from '../../../../../resources/domain/imageCache'
import { chainColorCssVariable } from '../../../../../resources/style/tokens/colors'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
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
  const hydrating = useRef(new Set<number>())
  const rows = createNetworkRows({
    balances: shared.balances,
    networks: shared.networks,
    query,
    showTestnets: shared.showTestnets
  })

  useEffect(() => {
    rows.forEach((chain) => {
      const icon = shared.networksMeta[chain.chainId]?.icon
      if (icon && isCachedImageReference(icon)) return
      if (hydrating.current.has(chain.chainId)) return

      hydrating.current.add(chain.chainId)
      void link.executeCommand({ type: 'network.icon-hydrate', chainId: chain.chainId }).finally(() => {
        hydrating.current.delete(chain.chainId)
      })
    })
  }, [rows, shared.networksMeta])

  const icon = (chain: any, size = 30) => {
    const metadata = shared.networksMeta[chain.chainId] || {}
    if (metadata.icon) {
      return <img alt='' src={cachedImageUrl(metadata.icon)} style={{ height: size, width: size }} />
    }
    if (
      ['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan'].includes(
        String(chain.name).toLowerCase()
      )
    ) {
      return svg.eth(14)
    }
    return (
      <div
        className='t2ChainIconDot'
        style={{
          background: chainColorCssVariable(metadata.primaryColor),
          height: 12,
          width: 12
        }}
      />
    )
  }
  const viewRows = rows.map((chain) => ({ ...chain, icon: icon(chain) }))

  return (
    <NetworksView
      allTotal={shared.balances.reduce((sum, balance) => sum + balance.totalValue, 0)}
      enabledChainDots={viewRows
        .filter((chain) => chain.on)
        .slice(0, 4)
        .map((chain) => (
          <div
            key={chain.chainId}
            className='t2NetworkDotSmall'
            style={{
              background: chainColorCssVariable(shared.networksMeta[chain.chainId]?.primaryColor)
            }}
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
