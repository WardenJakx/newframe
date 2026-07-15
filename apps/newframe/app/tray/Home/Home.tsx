import React from 'react'

import { HomeHeader } from './components/HomeHeader'
import { HomeNavigation } from './components/HomeNavigation'
import { HomeNotifications } from './components/HomeNotifications'
import { PortfolioHero } from './features/positions/PortfolioHero'
import { HomeOverlayRouter } from './HomeOverlayRouter'
import { HomeSectionRouter } from './HomeSectionRouter'
import { useHomeCommand } from './hooks/useHomeCommand'
import { HomeUiProvider } from './state/HomeUiProvider'

function HomeContent() {
  useHomeCommand()

  return (
    <div className='t2Home'>
      <HomeHeader />
      <HomeNotifications />
      <PortfolioHero />
      <HomeNavigation />
      <HomeSectionRouter />
      <HomeOverlayRouter />
    </div>
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
