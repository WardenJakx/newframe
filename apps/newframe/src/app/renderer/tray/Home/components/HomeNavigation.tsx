import { useShallow } from 'zustand/react/shallow'

import { chainColorValue } from '../../../../../features/chains/domain/chain/colors.ts'
import { ChainDot } from '../../../../../features/chains/renderer/ChainDot.tsx'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector.tsx'
import { ChainIcon } from '../../../../../shared/renderer/ui/ChainIcon.tsx'
import { useHomeUiStore } from '../state/HomeUiProvider.tsx'
import { HomeNavigationView } from './HomeNavigationView.tsx'

export function HomeNavigation() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      chains: state.chains.ethereum,
      chainsMeta: state.chainsMeta.ethereum,
      showTestnets: !!state.showTestnets
    }))
  )
  const section = useHomeUiStore((state) => state.section)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSection = useHomeUiStore((state) => state.setSection)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const chains = Object.keys(shared.chains)
    .map((id) => ({ chainId: Number(id), ...shared.chains[Number(id)] }))
    .filter((chain) => !chain.isTestnet || shared.showTestnets)
  const selected = chains.find((chain) => chain.chainId === selectedChainId)
  return (
    <HomeNavigationView
      enabledChainDots={chains
        .filter((chain) => chain.on)
        .slice(0, 4)
        .map((chain) => (
          <ChainDot
            key={chain.chainId}
            color={chainColorValue(shared.chainsMeta[chain.chainId]?.primaryColor)}
          />
        ))}
      onOpenChains={() => openOverlay({ type: 'chains' })}
      onSelectSection={setSection}
      section={section}
      selectedChain={
        selected
          ? {
              icon: (
                <ChainIcon chainId={selected.chainId} chains={shared.chains} chainsMeta={shared.chainsMeta} />
              ),
              name: selected.name
            }
          : undefined
      }
    />
  )
}
