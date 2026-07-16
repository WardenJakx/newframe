import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../resources/link'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ConnectedDappsView } from './ConnectedDappsView'

const EMPTY_RECORD: Record<string, any> = {}

export function ConnectedDapps() {
  const { accountId, permissions } = useWalletSelector(
    useShallow((state) => {
      const accountId = state.currentAccount || ''
      return {
        accountId,
        permissions: (accountId && state.permissions?.[accountId]) || EMPTY_RECORD
      }
    })
  )
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const dapps = Object.keys(permissions)
    .filter((id) => permissions[id]?.provider)
    .sort((a, b) => (permissions[a].origin < permissions[b].origin ? -1 : 1))
    .map((id) => ({ id, origin: permissions[id].origin }))

  return (
    <ConnectedDappsView
      dapps={dapps}
      onBack={() => openOverlay({ type: 'menu' })}
      onClear={(originId) => void link.executeCommand({ type: 'permission.clear', accountId, originId })}
      onClearAll={() => void link.executeCommand({ type: 'permission.clear', accountId })}
    />
  )
}
