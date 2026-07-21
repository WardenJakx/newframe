import { useShallow } from 'zustand/react/shallow'

import { chainColorValue } from '../../../../resources/colors'
import { ChainDot } from '../../../../resources/Components/ChainDot'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { ChainIcon } from './ChainIcon'
import { HomeNavigationView } from './HomeNavigationView'

const EMPTY_RECORD: Record<string, any> = {}

export function HomeNavigation() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
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
