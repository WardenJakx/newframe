import type { DisplayedBalance } from '../../asset-data/domain/balance'
import { AssetDetailsView } from './AssetDetailsView'
import type { PortfolioCapability } from './portfolioCapability'
import { useAccountBalances } from './useAccountBalances'
import { usePortfolioActions } from './usePortfolioActions'

export function AssetDetails({
  asset,
  capability,
  onBack,
  selectedChainId
}: {
  asset: DisplayedBalance
  capability: Pick<PortfolioCapability, 'hydrateTokenImage' | 'openSideTray' | 'writeText'>
  onBack: () => void
  selectedChainId: number
}) {
  const shared = useAccountBalances()
  const actions = usePortfolioActions(capability, shared.balances, selectedChainId)

  return (
    <AssetDetailsView
      asset={asset}
      clipboard={capability}
      canSend={actions.canSend(asset)}
      canTrade={actions.canTrade(asset)}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      imageCapability={capability}
      onBack={onBack}
      onSend={() => actions.openSend(asset)}
      onTrade={() => actions.openTrade(asset)}
    />
  )
}
