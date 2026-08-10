import { HomeHeader } from './components/HomeHeader'
import { HomeNavigation } from './components/HomeNavigation'
import { HomeNotifications } from './components/HomeNotifications'
import { PortfolioHero } from '../../../../features/portfolio/renderer/PortfolioHero'
import { HomeOverlayRouter } from './HomeOverlayRouter'
import { HomeSectionRouter } from './HomeSectionRouter'
import { useHomeCommand } from './hooks/useHomeCommand'
import { HomeUiProvider, useHomeUiStore } from './state/HomeUiProvider'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import type { RequestRendererCapabilities } from '../../../../features/requests/renderer/requestCapabilities'
import type { AccountsCapability } from '../../../../features/accounts/renderer/accountsCapability'
import type { ConnectionsCapability } from '../../../../features/connections/renderer/connectionsCapability'
import type { NetworksCapability } from '../../../../features/networks/renderer/networksCapability'
import type { PortfolioCapability } from '../../../../features/portfolio/renderer/portfolioCapability'
import type { SecurityCapability } from '../../../../features/security/renderer/securityCapability'
import type { SettingsCapability } from '../../../../features/settings/renderer/settingsCapability'
import type { TokensCapability } from '../../../../features/tokens/renderer/tokensCapability'
import type { ActivityCapability } from '../../../../features/transactions/renderer/activity/activityCapability'
import type { OrdersCapability } from '../../../../features/transactions/trade/renderer/orders/ordersCapability'
import type { HomeCapability } from './homeCapability'

const homeRecipe = cva({
  base: { position: 'absolute', inset: 0, display: 'flex', minHeight: 0, flexDirection: 'column' }
})

export interface HomeCapabilities {
  accounts: AccountsCapability
  activity: ActivityCapability
  connections: ConnectionsCapability
  home: HomeCapability
  networks: NetworksCapability
  orders: OrdersCapability
  portfolio: PortfolioCapability
  requests: Pick<RequestRendererCapabilities, 'panel' | 'review'>
  security: SecurityCapability
  settings: SettingsCapability
  tokens: TokensCapability
}

function HomeContent({ capabilities }: { capabilities: HomeCapabilities }) {
  useHomeCommand(capabilities.home)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)

  return (
    <main className={homeRecipe()}>
      <HomeHeader capability={capabilities.home} />
      <HomeNotifications capability={capabilities.home} />
      <PortfolioHero capability={capabilities.portfolio} selectedChainId={selectedChainId} />
      <HomeNavigation />
      <HomeSectionRouter
        activity={capabilities.activity}
        orders={capabilities.orders}
        portfolio={capabilities.portfolio}
      />
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
