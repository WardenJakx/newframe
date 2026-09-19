import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../shared/renderer/ui/signerPresentation'
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
  const accountType = useWalletSelector((state) =>
    accountDisplayType(
      Object.values(state.accounts).find(
        (account) => account.address.toLowerCase() === asset.address.toLowerCase()
      )
    )
  )
  const shared = useAccountBalances()
  const actions = usePortfolioActions(capability, shared.balances, selectedChainId)

  return (
    <AssetDetailsView
      asset={asset}
      accountType={accountType}
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
