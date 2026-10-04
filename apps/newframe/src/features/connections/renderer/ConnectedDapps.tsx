import { useShallow } from 'zustand/react/shallow'

import type { MainTrayProjection } from '../../../platform/state-sync/contract/projections.ts'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector.tsx'
import { ConnectedDappsView, type ConnectedExtensionRow } from './ConnectedDappsView.tsx'
import type { ConnectionsCapability } from './connectionsCapability.ts'

const EMPTY_RECORD: MainTrayProjection['accountAccessGrants'][string] = {}

export function ConnectedDapps({
  capability,
  onBack
}: {
  capability: Pick<
    ConnectionsCapability,
    'clearAccountAccessGrant' | 'forgetExtension' | 'openExtensionAccess'
  >
  onBack: () => void
}) {
  const {
    accountId,
    accountOrder,
    extensionAccess,
    knownExtensions,
    accountAccessGrants: grants
  } = useWalletSelector(
    useShallow((state) => {
      const accountId = state.currentAccount || ''
      const grantsByAccount: Partial<typeof state.accountAccessGrants> = state.accountAccessGrants
      return {
        accountId,
        accountOrder: state.accountOrder,
        extensionAccess: state.extensionAccess,
        knownExtensions: state.knownExtensions,
        accountAccessGrants: accountId ? (grantsByAccount[accountId] ?? EMPTY_RECORD) : EMPTY_RECORD
      }
    })
  )
  const dapps = Object.keys(grants)
    .filter((id) => grants[id]?.provider)
    .sort((a, b) => (grants[a].origin < grants[b].origin ? -1 : 1))
    .map((id) => ({ id, origin: grants[id].origin }))
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
      onClear={(originId) => void capability.clearAccountAccessGrant({ accountId, originId })}
      onClearAll={() => void capability.clearAccountAccessGrant({ accountId })}
      onManageExtension={(extensionId) => void capability.openExtensionAccess({ extensionId })}
      onRemoveExtension={(extensionId) => void capability.forgetExtension({ extensionId })}
    />
  )
}
