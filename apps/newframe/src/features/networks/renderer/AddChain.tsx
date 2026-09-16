import { AddChainView } from './AddChainView'
import type { NetworksCapability } from './networksCapability'

export interface PendingChainRequest {
  chain?: {
    id?: string | number
    chainId?: string | number
    icon?: string
    name?: string
    nativeCurrencyName?: string
    symbol?: string
    primaryRpc?: string
    secondaryRpc?: string
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
  const chain = pending.chain ?? {}
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
  return <AddChainView chain={chain} onApprove={() => resolve(true)} onReject={() => resolve(false)} />
}
