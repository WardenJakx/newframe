import React from 'react'

import Send from '../../../features/transactions/send/renderer/index.tsx'
import type { SendCapability } from '../../../features/transactions/send/renderer/sendService.ts'
import Trade from '../../../features/transactions/trade/renderer/index.tsx'
import type { TradeCapability } from '../../../features/transactions/trade/renderer/tradeService.ts'
import { useSideTraySelector } from '../../../platform/state-sync/renderer/useAppSelector.tsx'
import { AddressNamesContext } from '../../../shared/renderer/addressNames.tsx'
import { parseSideTrayHashRoute } from '../../contracts/side-tray/index.ts'

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
  const addressNames = useSideTraySelector((state) => state.addressNames)
  return (
    <AddressNamesContext.Provider value={addressNames}>
      <SideTrayRoute send={send} trade={trade} />
    </AddressNamesContext.Provider>
  )
}

function SideTrayRoute({ send, trade }: { send: SendCapability; trade: TradeCapability }) {
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
