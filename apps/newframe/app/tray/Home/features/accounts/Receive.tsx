import React, { useEffect, useRef, useState } from 'react'
import link from '../../../../../resources/link'
import svg from '../../../../../resources/svg'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ReceiveView } from './ReceiveView'

function signerIcon(type: string, size = 16) {
  if ((type || '').toLowerCase() === 'address') return svg.eye(size)
  if (type === 'ledger') return svg.ledger(size)
  if (type === 'trezor') return svg.trezor(size)
  if (type === 'lattice') return svg.lattice(size)
  return svg.flame(size + 2)
}

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
      icon={type.toLowerCase() === 'address' ? svg.eye(22) : signerIcon(type, 22)}
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
