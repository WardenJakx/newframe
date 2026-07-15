import React from 'react'

import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { RequestsOverlayView } from './RequestsOverlayView'

export function RequestsOverlay() {
  const accountId = useWalletSelector((state) => state.currentAccount || '')
  const openOverlay = useHomeUiStore((state) => state.openOverlay)

  return <RequestsOverlayView accountId={accountId} onBack={() => openOverlay({ type: 'menu' })} />
}
