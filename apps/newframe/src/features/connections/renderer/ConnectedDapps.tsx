import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { ConnectedDappsView } from './ConnectedDappsView'
import type { ConnectionsCapability } from './connectionsCapability'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'

const EMPTY_RECORD: WalletRendererState['permissions'][string] = {}

export function ConnectedDapps({
  capability,
  onBack
}: {
  capability: Pick<ConnectionsCapability, 'clearPermission'>
  onBack: () => void
}) {
  const { accountId, permissions } = useWalletSelector(
    useShallow((state) => {
      const accountId = state.currentAccount || ''
      return {
        accountId,
        permissions: (accountId && state.permissions?.[accountId]) || EMPTY_RECORD
      }
    })
  )
  const dapps = Object.keys(permissions)
    .filter((id) => permissions[id]?.provider)
    .sort((a, b) => (permissions[a].origin < permissions[b].origin ? -1 : 1))
    .map((id) => ({ id, origin: permissions[id].origin }))

  return (
    <ConnectedDappsView
      dapps={dapps}
      onBack={onBack}
      onClear={(originId) => void capability.clearPermission({ accountId, originId })}
      onClearAll={() => void capability.clearPermission({ accountId })}
    />
  )
}
