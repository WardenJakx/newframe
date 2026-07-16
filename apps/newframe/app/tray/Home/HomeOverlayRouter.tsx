import { useHomeUiStore } from './state/HomeUiProvider'
import { HomeMenu } from './components/HomeMenu'
import { AssetDetails } from './features/positions/AssetDetails'
import { ActivityDetails } from './features/activity/ActivityDetails'
import { OrderDetails } from './features/orders/OrderDetails'
import { Networks } from './features/networks/Networks'
import { AddChain } from './features/networks/AddChain'
import { Accounts } from './features/accounts/Accounts'
import { Receive } from './features/accounts/Receive'
import { RequestsOverlay } from './features/requests/RequestsOverlay'
import { ConnectedDapps } from './features/dapps/ConnectedDapps'
import Tokens from './features/tokens'
import { Settings } from './features/settings/Settings'
import { About } from './features/settings/About'

export function HomeOverlayRouter() {
  const overlay = useHomeUiStore((state) => state.overlay)

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
      return <OrderDetails orderId={overlay.orderId} />
    case 'receive':
      return <Receive accountId={overlay.accountId} />
    default:
      return null
  }
}
