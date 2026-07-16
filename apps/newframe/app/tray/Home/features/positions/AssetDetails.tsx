import type { DisplayedBalance } from '../../../../../resources/domain/balance'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { AssetDetailsView } from './AssetDetailsView'
import { usePortfolioActions } from './usePortfolioActions'

export function AssetDetails({ asset }: { asset: DisplayedBalance }) {
  const shared = useAccountBalances()
  const actions = usePortfolioActions(shared.balances)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  return (
    <AssetDetailsView
      asset={asset}
      canSend={actions.canSend(asset)}
      canTrade={actions.canTrade(asset)}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onBack={closeOverlay}
      onSend={() => actions.openSend(asset)}
      onTrade={() => actions.openTrade(asset)}
    />
  )
}
