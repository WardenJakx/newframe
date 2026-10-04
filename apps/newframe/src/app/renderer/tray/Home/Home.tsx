import { cva } from '../../../../../generated/styled-system/css/cva.js'
import type { AccountsCapability } from '../../../../features/accounts/renderer/accountsCapability.ts'
import type { ChainsCapability } from '../../../../features/chains/renderer/chainsCapability.ts'
import type { ConnectionsCapability } from '../../../../features/connections/renderer/connectionsCapability.ts'
import type { PortfolioCapability } from '../../../../features/portfolio/renderer/portfolioCapability.ts'
import { PortfolioHero } from '../../../../features/portfolio/renderer/PortfolioHero.tsx'
import type { RequestTrayCapabilities } from '../../../../features/requests/renderer/requestCapabilities.ts'
import type { SecurityCapability } from '../../../../features/security/renderer/securityCapability.ts'
import type { SettingsCapability } from '../../../../features/settings/renderer/settingsCapability.ts'
import type { TokensCapability } from '../../../../features/tokens/renderer/tokensCapability.ts'
import type { ActivityCapability } from '../../../../features/transactions/renderer/activity/activityCapability.ts'
import type { OrdersCapability } from '../../../../features/transactions/trade/renderer/orders/ordersCapability.ts'
import type { QrCameraCapability } from '../../../../platform/desktop/renderer/camera.ts'
import type { AirGapRequestReference } from '../../../../platform/signing/domain/airgap.ts'
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
  requests: Pick<RequestTrayCapabilities, 'panel' | 'review' | 'safe' | 'external'>
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
