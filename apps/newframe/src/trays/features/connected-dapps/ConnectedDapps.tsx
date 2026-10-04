import type { WalletRendererState } from '@newframe/schema/projections'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import { ConnectedDappsView, type ConnectedExtensionRow } from './ConnectedDappsView.tsx'
import type { ConnectionsCapability } from './connectionsCapability.ts'

const EMPTY_RECORD: WalletRendererState['permissions'][string] = {}

export function ConnectedDapps({
  capability,
  onBack
}: {
  capability: Pick<ConnectionsCapability, 'clearPermission' | 'forgetExtension' | 'openExtensionAccess'>
  onBack: () => void
}) {
  const { accountId, accountOrder, extensionAccess, knownExtensions, permissions } = useWalletSelector(
    useShallow((state) => {
      const accountId = state.currentAccount || ''
      const permissionsByAccount: Partial<typeof state.permissions> = state.permissions
      return {
        accountId,
        accountOrder: state.accountOrder,
        extensionAccess: state.extensionAccess,
        knownExtensions: state.knownExtensions,
        permissions: accountId ? (permissionsByAccount[accountId] ?? EMPTY_RECORD) : EMPTY_RECORD
      }
    })
  )
  const dapps = Object.keys(permissions)
    .filter((id) => permissions[id]?.provider)
    .sort((a, b) => (permissions[a].origin < permissions[b].origin ? -1 : 1))
    .map((id) => ({ id, origin: permissions[id].origin }))
  const extensions = Object.keys(knownExtensions)
    .filter((id) => knownExtensions[id])
    .sort()
    .map((id): ConnectedExtensionRow => {
      const access = Object.hasOwn(extensionAccess, id) ? extensionAccess[id] : undefined
      return {
        id,
        all: access?.all ?? false,
        sharedAccounts: accountOrder.filter((accountId) => access?.accounts.includes(accountId)).length
      }
    })

  return (
    <ConnectedDappsView
      dapps={dapps}
      extensions={extensions}
      onBack={onBack}
      onClear={(originId) => void capability.clearPermission({ accountId, originId })}
      onClearAll={() => void capability.clearPermission({ accountId })}
      onManageExtension={(extensionId) => void capability.openExtensionAccess({ extensionId })}
      onRemoveExtension={(extensionId) => void capability.forgetExtension({ extensionId })}
    />
  )
}
