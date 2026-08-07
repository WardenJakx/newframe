import { Icon } from '@newframe/ui/icon'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ReceiveView } from './ReceiveView'
import { signerIconName } from '../../../../shared/signerPresentation'

export function Receive({ accountId }: { accountId: string }) {
  const account = useWalletSelector((state) => state.accounts?.[accountId])
  const showLocalNameWithENS = useWalletSelector((state) => !!state.showLocalNameWithENS)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  if (!account) return null
  const name = account.ensName && !showLocalNameWithENS ? account.ensName : account.name
  const type = String(account.lastSignerType || '')

  return (
    <ReceiveView
      account={account}
      icon={<Icon name={signerIconName(type)} size='large' />}
      name={name}
      onBack={closeOverlay}
    />
  )
}
