import React from 'react'

import Send from '../../../features/transactions/send/renderer'
import type { SendCapability } from '../../../features/transactions/send/renderer/sendService'
import Trade from '../../../features/transactions/trade/renderer'
import type { TradeCapability } from '../../../features/transactions/trade/renderer/tradeService'
import { parseSideTrayHashRoute } from '../../contracts/sidetray'

function useHashRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash)

  React.useEffect(() => {
    const updateHash = () => setHash(window.location.hash)

    window.addEventListener('hashchange', updateHash)

    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  return parseSideTrayHashRoute(hash)
}

function App({ send, trade }: { send: SendCapability; trade: TradeCapability }) {
  const route = useHashRoute()
  const assetId = route.searchParams.get('assetId')
  const chainIdValue = Number(route.searchParams.get('chainId'))
  const chainId = Number.isInteger(chainIdValue) && chainIdValue > 0 ? chainIdValue : undefined

  if (route.name === 'trade') {
    return (
      <Trade
        assetId={assetId}
        capability={trade}
        chainId={chainId}
        key={`trade:${assetId ?? ''}:${chainId ?? ''}`}
      />
    )
  }

  return <Send assetId={assetId} capability={send} key={`send:${assetId ?? ''}`} />
}

export default App
