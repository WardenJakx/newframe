import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../shared/renderer/ui/signerPresentation'
import type { AccountsCapability } from './accountsCapability'
import { ReceiveView } from './ReceiveView'

export function Receive({
  accountId,
  capability,
  onBack
}: {
  accountId: string
  capability: Pick<AccountsCapability, 'writeText'>
  onBack: () => void
}) {
  const account = useWalletSelector((state) => state.accounts?.[accountId])
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
