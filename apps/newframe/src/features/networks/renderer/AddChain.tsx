import { AddChainView } from './AddChainView'
import type { NetworksCapability } from './networksCapability'

export interface PendingChainRequest {
  chain?: {
    id?: string | number
    chainId?: string | number
    name?: string
    symbol?: string
    primaryRpc?: string
    explorer?: string
  }
  homeCommandId?: number
  requestId?: string
}

export function AddChain({
  capability,
  onResolved,
  pending
}: {
  capability: Pick<NetworksCapability, 'resolveAddChain'>
  onResolved: (outcome: 'approved' | 'rejected') => void
  pending: PendingChainRequest
}) {
  const chain = pending.chain || {}
  const requestId = pending.requestId
  const homeCommandId = pending.homeCommandId
  const resolve = (approved: boolean) => {
    if (requestId || homeCommandId) {
      void capability.resolveAddChain({
        approved,
        ...(requestId ? { requestId } : { homeCommandId })
      })
    }
    onResolved(approved ? 'approved' : 'rejected')
  }
  const rows = [
    ['Name', chain.name],
    ['Chain ID', chain.id],
    ['Symbol', chain.symbol],
    ['RPC', chain.primaryRpc],
    ['Explorer', chain.explorer]
  ].filter(
    (row): row is [string, string | number] => row[1] !== undefined && row[1] !== null && row[1] !== ''
  )

  return <AddChainView onApprove={() => resolve(true)} onReject={() => resolve(false)} rows={rows} />
}
