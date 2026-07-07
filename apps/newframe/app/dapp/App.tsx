import React from 'react'

import { parseDappLauncherHashRoute } from '../../resources/domain/dappLauncher'
import Send from './Send'
import Trade from './Trade'

function useHashRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash)

  React.useEffect(() => {
    const updateHash = () => setHash(window.location.hash)

    window.addEventListener('hashchange', updateHash)

    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  return parseDappLauncherHashRoute(hash)
}

function App() {
  const route = useHashRoute()
  const assetId = route.searchParams.get('assetId')

  if (route.name === 'trade') return <Trade assetId={assetId} key={`trade:${assetId || ''}`} />

  return <Send assetId={assetId} key={`send:${assetId || ''}`} />
}

export default App
