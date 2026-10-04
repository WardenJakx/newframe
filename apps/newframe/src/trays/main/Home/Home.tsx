import type { AirGapRequestReference } from '@newframe/schema/airgap'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { AccountsCapability } from '../../features/accounts/accountsCapability.ts'
import type { ActivityCapability } from '../../features/activity/activityCapability.ts'
import type { ChainsCapability } from '../../features/chains/chainsCapability.ts'
import type { ConnectionsCapability } from '../../features/connected-dapps/connectionsCapability.ts'
import type { RequestRendererCapabilities } from '../../features/dapp-requests/requestCapabilities.ts'
import type { PortfolioCapability } from '../../features/portfolio/portfolioCapability.ts'
import { PortfolioHero } from '../../features/portfolio/PortfolioHero.tsx'
import type { SecurityCapability } from '../../features/security/securityCapability.ts'
import type { SettingsCapability } from '../../features/settings/settingsCapability.ts'
import type { TokensCapability } from '../../features/tokens/tokensCapability.ts'
import type { OrdersCapability } from '../../features/trading/orders/ordersCapability.ts'
import type { QrCameraCapability } from '../../shared/camera/camera.ts'
import { HomeHeader } from './components/HomeHeader.tsx'
import { HomeNavigation } from './components/HomeNavigation.tsx'
import { HomeNotifications } from './components/HomeNotifications.tsx'
import type { HomeCapability } from './homeCapability.ts'
import { HomeOverlayRouter } from './HomeOverlayRouter.tsx'
import { HomeSectionRouter } from './HomeSectionRouter.tsx'
import { useHomeCommand } from './hooks/useHomeCommand.ts'
import { HomeUiProvider, useHomeUiStore } from './state/HomeUiProvider.tsx'

const homeRecipe = cva({
  base: { position: 'absolute', inset: 0, display: 'flex', minHeight: 0, flexDirection: 'column' }
})

export interface HomeCapabilities {
  recoverSigner?: (signerId: string) => void
  airgapSigning?: (reference: AirGapRequestReference) => void
  accounts: AccountsCapability
  camera: QrCameraCapability
  activity: ActivityCapability
  connections: ConnectionsCapability
  home: HomeCapability
  chains: ChainsCapability
  orders: OrdersCapability
  portfolio: PortfolioCapability
  requests: Pick<RequestRendererCapabilities, 'panel' | 'review' | 'safe' | 'external'>
  security: SecurityCapability
  settings: SettingsCapability
  tokens: TokensCapability
}

function HomeContent({ capabilities }: { capabilities: HomeCapabilities }) {
  useHomeCommand(capabilities.home)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const overlayActive = useHomeUiStore((state) => state.overlay.type !== 'none')

  return (
    <main className={homeRecipe()}>
      <div aria-hidden={overlayActive || undefined} className={homeRecipe()} inert={overlayActive}>
        <HomeHeader capability={capabilities.home} />
        <HomeNotifications capability={capabilities.home} />
        <PortfolioHero capability={capabilities.portfolio} selectedChainId={selectedChainId} />
        <HomeNavigation />
        <HomeSectionRouter
          activity={capabilities.activity}
          orders={capabilities.orders}
          portfolio={capabilities.portfolio}
        />
      </div>
      <HomeOverlayRouter capabilities={capabilities} />
    </main>
  )
}

function Home({ capabilities }: { capabilities: HomeCapabilities }) {
  return (
    <HomeUiProvider>
      <HomeContent capabilities={capabilities} />
    </HomeUiProvider>
  )
}

export default Home
