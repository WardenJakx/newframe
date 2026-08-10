import { useShallow } from 'zustand/react/shallow'

import { chainColorValue } from '../../../../../features/networks/domain/chain/colors'
import { ChainDot } from '../../../../../features/networks/renderer/ChainDot'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { ChainIcon } from '../../../../../shared/renderer/ui/ChainIcon'
import { HomeNavigationView } from './HomeNavigationView'
import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'

const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}

export function HomeNavigation() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_NETWORKS,
      networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
      showTestnets: !!state.showTestnets
    }))
  )
  const section = useHomeUiStore((state) => state.section)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSection = useHomeUiStore((state) => state.setSection)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const chains = Object.keys(shared.networks)
    .map((id) => ({ chainId: Number(id), ...shared.networks[Number(id)] }))
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
            color={chainColorValue(shared.networksMeta[chain.chainId]?.primaryColor)}
          />
        ))}
      onOpenNetworks={() => openOverlay({ type: 'networks' })}
      onSelectSection={setSection}
      section={section}
      selectedChain={
        selected
          ? {
              icon: (
                <ChainIcon
                  chainId={selected.chainId}
                  networks={shared.networks}
                  networksMeta={shared.networksMeta}
                />
              ),
              name: selected.name
            }
          : undefined
      }
    />
  )
}
