import { Icon } from '@newframe/ui/icon'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { ReceiveView } from './ReceiveView'
import { signerIconName } from '../../../shared/renderer/ui/signerPresentation'
import type { AccountsCapability } from './accountsCapability'

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

  if (!account) return null
  const name = account.ensName && !showLocalNameWithENS ? account.ensName : account.name
  const type = String(account.lastSignerType || '')

  return (
    <ReceiveView
      account={account}
      clipboard={capability}
      icon={<Icon name={signerIconName(type)} size='large' />}
      name={name}
      onBack={onBack}
    />
  )
}
