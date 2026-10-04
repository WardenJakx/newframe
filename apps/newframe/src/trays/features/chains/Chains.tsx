import { useState } from 'react'

import { chainColorValue } from '../../../features/chains/domain/chain/colors.ts'
import { useAccountBalances } from '../../shared/hooks/useAccountBalances.ts'
import { ChainIcon } from '../../shared/ui/ChainIcon.tsx'
import { ChainDot } from './ChainDot.tsx'
import { createChainRows } from './chainModel.ts'
import type { ChainsCapability } from './chainsCapability.ts'
import { ChainsView } from './ChainsView.tsx'

export interface ChainsProps {
  capability: Pick<ChainsCapability, 'remove' | 'setChainActivation' | 'setPrimaryRpc'>
  onClose: () => void
  onSelectionChange: (chainId: number) => void
  selectedChainId: number
}

export function Chains({ capability, onClose, onSelectionChange, selectedChainId }: ChainsProps) {
  const shared = useAccountBalances()
  const chains: Partial<typeof shared.chains> = shared.chains
  const getChain = (chainId: number): (typeof shared.chains)[number] | undefined => chains[chainId]
  const [query, setQuery] = useState('')
  const [kebabChainId, setKebabChainId] = useState(0)
  const [rpcDrafts, setRpcDrafts] = useState<Record<number, string | undefined>>({})
  const rows = createChainRows({
    balances: shared.balances,
    chains: shared.chains,
    query,
    showTestnets: shared.showTestnets
  })

  const viewRows = rows.map((chain) => ({
    ...chain,
    icon: (
      <ChainIcon chainId={chain.chainId} chains={shared.chains} chainsMeta={shared.chainsMeta} size='large' />
    )
  }))

  return (
    <ChainsView
      allTotal={shared.balances.reduce((sum, balance) => sum + balance.totalValue, 0)}
      enabledChainDots={viewRows
        .filter((chain) => chain.on)
        .slice(0, 4)
        .map((chain) => (
          <ChainDot
            key={chain.chainId}
            color={chainColorValue(shared.chainsMeta[chain.chainId]?.primaryColor)}
          />
        ))}
      getRpcDraft={(chainId) => rpcDrafts[chainId] ?? getChain(chainId)?.connection.primary.custom ?? ''}
      kebabChainId={kebabChainId}
      onBack={onClose}
      onChangeQuery={setQuery}
      onChangeRpcDraft={(chainId, value) =>
        setRpcDrafts((current) => ({ ...current, [chainId]: value.replace(/\s+/g, '') }))
      }
      onSaveRpc={(chainId) => {
        const url = String(rpcDrafts[chainId] ?? getChain(chainId)?.connection.primary.custom ?? '').trim()
        if (url) {
          void capability.setPrimaryRpc({ chainId, url })
        }
      }}
      onRemove={(chainId) => {
        void capability.remove({ chainId })
        if (selectedChainId === chainId) {
          onSelectionChange(0)
        }
        setKebabChainId(0)
      }}
      onSelect={(chainId) => {
        onSelectionChange(chainId)
        onClose()
      }}
      onToggleChain={(chainId, enabled) => {
        void capability.setChainActivation({ chainId, enabled })
        if (!enabled && selectedChainId === chainId) {
          onSelectionChange(0)
        }
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
