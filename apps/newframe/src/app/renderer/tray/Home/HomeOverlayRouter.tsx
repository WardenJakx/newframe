import { useEffect } from 'react'

import { useHomeUiStore } from './state/HomeUiProvider'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { HomeMenu } from './components/HomeMenu'
import { AssetDetails } from '../../../../features/portfolio/renderer/AssetDetails'
import { ActivityDetails } from '../../../../features/transactions/renderer/activity/ActivityDetails'
import { OrderDetails } from '../../../../features/transactions/trade/renderer/orders/OrderDetails'
import { Networks } from '../../../../features/networks/renderer/Networks'
import { AddChain } from '../../../../features/networks/renderer/AddChain'
import { Accounts } from '../../../../features/accounts/renderer/Accounts'
import { Receive } from '../../../../features/accounts/renderer/Receive'
import { RequestsOverlay } from '../../../../features/requests/renderer/RequestsOverlay'
import { ConnectedDapps } from '../../../../features/connections/renderer/ConnectedDapps'
import Tokens from '../../../../features/tokens/renderer'
import { Settings } from '../../../../features/settings/renderer/Settings'
import { About } from '../../../../features/settings/renderer/About'

export function HomeOverlayRouter() {
  const overlay = useHomeUiStore((state) => state.overlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  const currentAccount = useWalletSelector((state) => state.currentAccount || '')
  const originatingAccountExists = useWalletSelector((state) =>
    overlay.type === 'asset' ? !!state.accounts?.[overlay.accountId] : true
  )

  const staleAssetOverlay =
    overlay.type === 'asset' &&
    (!currentAccount || !originatingAccountExists || overlay.accountId !== currentAccount)

  useEffect(() => {
    if (staleAssetOverlay) closeOverlay()
  }, [closeOverlay, staleAssetOverlay])

  if (staleAssetOverlay) return null

  switch (overlay.type) {
    case 'menu':
      return <HomeMenu />
    case 'accounts':
      return <Accounts />
    case 'networks':
      return <Networks />
    case 'settings':
      return <Settings />
    case 'about':
      return <About />
    case 'requests':
      return <RequestsOverlay />
    case 'dapps':
      return <ConnectedDapps />
    case 'tokens':
      return <Tokens initialToken={overlay.initialToken} />
    case 'addChain':
      return <AddChain />
    case 'asset':
      return <AssetDetails asset={overlay.asset} />
    case 'activity':
      return <ActivityDetails activityId={overlay.activityId} />
    case 'order':
      return <OrderDetails assetImages={overlay.assetImages} orderId={overlay.orderId} />
    case 'receive':
      return <Receive accountId={overlay.accountId} />
    default:
      return null
  }
}
