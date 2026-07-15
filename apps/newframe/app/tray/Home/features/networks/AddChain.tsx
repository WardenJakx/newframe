import React from 'react'

import link from '../../../../../resources/link'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { AddChainView } from './AddChainView'

export function AddChain() {
  const overlay = useHomeUiStore((state) => state.overlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  if (overlay.type !== 'addChain') return null

  const pending = overlay.pending || {}
  const chain = pending.chain || pending.request?.chain || {}
  const requestId = pending.request?.handlerId
  const homeCommandId = pending.homeCommandId
  const resolve = (approved: boolean) => {
    if (requestId || homeCommandId) {
      void link.executeCommand({
        type: 'network.request-resolve',
        approved,
        ...(requestId ? { requestId } : { homeCommandId })
      })
    }
    if (approved) openOverlay({ type: 'networks' })
    else closeOverlay()
  }
  const rows = [
    ['Name', chain.name],
    ['Chain ID', chain.id],
    ['Symbol', chain.symbol],
    ['RPC', chain.primaryRpc],
    ['Explorer', chain.explorer]
  ].filter((row): row is [string, any] => row[1] !== undefined && row[1] !== null && row[1] !== '')

  return <AddChainView onApprove={() => resolve(true)} onReject={() => resolve(false)} rows={rows} />
}
