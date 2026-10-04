import type { MainTrayProjection } from '../../../platform/state-sync/contract/projections.ts'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector.tsx'
import { accountDisplayType } from '../../../shared/renderer/ui/signerPresentation.ts'
import type { AccountsCapability } from './accountsCapability.ts'
import { ReceiveView } from './ReceiveView.tsx'

export function Receive({
  accountId,
  capability,
  onBack
}: {
  accountId: string
  capability: Pick<AccountsCapability, 'writeText'>
  onBack: () => void
}) {
  const account = useWalletSelector(
    (state) =>
      (state.accounts as Record<string, MainTrayProjection['accounts'][string] | undefined>)[accountId]
  )
  const showLocalNameWithENS = useWalletSelector((state) => !!state.showLocalNameWithENS)

  if (!account) {
    return null
  }
  const name = account.ensName && !showLocalNameWithENS ? account.ensName : account.name
  const type = accountDisplayType(account)

  return (
    <ReceiveView account={account} clipboard={capability} accountType={type} name={name} onBack={onBack} />
  )
}
