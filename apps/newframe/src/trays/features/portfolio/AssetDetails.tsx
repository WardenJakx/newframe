import type { DisplayedBalance } from '../../../features/asset-data/domain/balance/index.ts'
import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import { accountDisplayType } from '../../shared/ui/signerPresentation.ts'
import { AssetDetailsView } from './AssetDetailsView.tsx'
import type { PortfolioCapability } from './portfolioCapability.ts'
import { useAccountBalances } from './useAccountBalances.ts'
import { usePortfolioActions } from './usePortfolioActions.ts'

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
      chains={shared.chains}
      chainsMeta={shared.chainsMeta}
      imageCapability={capability}
      onBack={onBack}
      onSend={() => actions.openSend(asset)}
      onTrade={() => actions.openTrade(asset)}
    />
  )
}
