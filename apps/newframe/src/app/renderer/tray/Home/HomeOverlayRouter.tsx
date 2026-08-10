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
import type { HomeCapabilities } from './Home'

export function HomeOverlayRouter({ capabilities }: { capabilities: HomeCapabilities }) {
  const overlay = useHomeUiStore((state) => state.overlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const setSelectedChainId = useHomeUiStore((state) => state.setSelectedChainId)
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
    case 'none':
      return null
    case 'menu':
      return <HomeMenu capability={capabilities.home} />
    case 'accounts':
      return (
        <Accounts
          capability={capabilities.accounts}
          initialNewAccountType={overlay.newAccountType}
          initialSelectedSigner={overlay.selectedSigner}
          initialShowAddAccounts={overlay.showAddAccounts}
          onClose={closeOverlay}
        />
      )
    case 'networks':
      return (
        <Networks
          capability={capabilities.networks}
          onClose={closeOverlay}
          onSelectionChange={setSelectedChainId}
          selectedChainId={selectedChainId}
        />
      )
    case 'settings':
      return (
        <Settings
          capability={capabilities.settings}
          onBack={() => openOverlay({ type: 'menu' })}
          onPostLockNavigation={() => openOverlay({ type: 'menu' })}
          onSelectedChainChange={setSelectedChainId}
          selectedChainId={selectedChainId}
          security={capabilities.security}
        />
      )
    case 'about':
      return <About capability={capabilities.settings} onBack={() => openOverlay({ type: 'menu' })} />
    case 'requests':
      return <RequestsOverlay capabilities={capabilities.requests} onBack={closeOverlay} />
    case 'dapps':
      return (
        <ConnectedDapps capability={capabilities.connections} onBack={() => openOverlay({ type: 'menu' })} />
      )
    case 'tokens':
      return (
        <Tokens
          capability={capabilities.tokens}
          initialToken={overlay.initialToken}
          onBack={() => openOverlay({ type: 'menu' })}
          onOpenNetworks={() => openOverlay({ type: 'networks' })}
        />
      )
    case 'addChain':
      return (
        <AddChain
          capability={capabilities.networks}
          onResolved={(outcome) => {
            if (outcome === 'approved') openOverlay({ type: 'networks' })
            else closeOverlay()
          }}
          pending={overlay.pending}
        />
      )
    case 'asset':
      return (
        <AssetDetails
          asset={overlay.asset}
          capability={capabilities.portfolio}
          onBack={closeOverlay}
          selectedChainId={selectedChainId}
        />
      )
    case 'activity':
      return (
        <ActivityDetails
          activityId={overlay.activityId}
          capability={capabilities.activity}
          onBack={closeOverlay}
        />
      )
    case 'order':
      return (
        <OrderDetails
          assetImages={overlay.assetImages}
          capability={capabilities.orders}
          onBack={closeOverlay}
          orderId={overlay.orderId}
        />
      )
    case 'receive':
      return (
        <Receive accountId={overlay.accountId} capability={capabilities.accounts} onBack={closeOverlay} />
      )
    default:
      return assertNever(overlay)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Home overlay: ${JSON.stringify(value)}`)
}
