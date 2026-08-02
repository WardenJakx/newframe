import { useEffect, useRef, useState } from 'react'
import { Icon } from '@newframe/ui/icon'
import link from '../../../../shared/link'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ReceiveView } from './ReceiveView'
import { signerIconName } from '../../../../shared/signerPresentation'

export function Receive({ accountId }: { accountId: string }) {
  const account = useWalletSelector((state) => state.accounts?.[accountId])
  const showLocalNameWithENS = useWalletSelector((state) => !!state.showLocalNameWithENS)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!account) return null
  const name = account.ensName && !showLocalNameWithENS ? account.ensName : account.name
  const type = String(account.lastSignerType || '')

  return (
    <ReceiveView
      account={account}
      copied={copied}
      icon={<Icon name={signerIconName(type)} size='large' />}
      name={name}
      onBack={closeOverlay}
      onCopy={() => {
        clearTimeout(timer.current)
        void link.executeCommand({ type: 'clipboard.write', text: account.address })
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }}
    />
  )
}
