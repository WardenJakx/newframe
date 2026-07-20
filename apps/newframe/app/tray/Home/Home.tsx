import { HomeHeader } from './components/HomeHeader'
import { HomeNavigation } from './components/HomeNavigation'
import { HomeNotifications } from './components/HomeNotifications'
import { PortfolioHero } from './features/positions/PortfolioHero'
import { HomeOverlayRouter } from './HomeOverlayRouter'
import { HomeSectionRouter } from './HomeSectionRouter'
import { useHomeCommand } from './hooks/useHomeCommand'
import { HomeUiProvider } from './state/HomeUiProvider'
import { cva } from '../../../resources/styled-system/css/cva.js'

const homeRecipe = cva({
  base: { position: 'absolute', inset: 0, display: 'flex', minHeight: 0, flexDirection: 'column' }
})

function HomeContent() {
  useHomeCommand()

  return (
    <main className={homeRecipe()}>
      <HomeHeader />
      <HomeNotifications />
      <PortfolioHero />
      <HomeNavigation />
      <HomeSectionRouter />
      <HomeOverlayRouter />
    </main>
  )
}

export function Home() {
  return (
    <HomeUiProvider>
      <HomeContent />
    </HomeUiProvider>
  )
}

export default Home
