import React, { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../resources/link'
import svg from '../../../../resources/svg'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeHeaderView } from './HomeHeaderView'

function signerIcon(type: string, size = 16) {
  if ((type || '').toLowerCase() === 'address') return svg.eye(size)
  if (type === 'ledger') return svg.ledger(size)
  if (type === 'trezor') return svg.trezor(size)
  if (type === 'lattice') return svg.lattice(size)
  return svg.flame(size + 2)
}

export function HomeHeader() {
  const { account, showLocalNameWithENS } = useWalletSelector(
    useShallow((state) => ({
      account: state.accounts?.[state.currentAccount],
      showLocalNameWithENS: !!state.showLocalNameWithENS
    }))
  )
  const overlay = useHomeUiStore((state) => state.overlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const type = String(account?.lastSignerType || '')
  const name = account
    ? account.ensName && !showLocalNameWithENS
      ? account.ensName
      : account.name
    : 'Add Account'

  return (
    <HomeHeaderView
      account={account}
      accountsOpen={overlay.type === 'accounts'}
      copied={copied}
      icon={account ? (type.toLowerCase() === 'address' ? svg.eye(16) : signerIcon(type)) : svg.accounts(16)}
      menuOpen={overlay.type === 'menu'}
      name={name}
      onCopy={() => {
        if (!account) return
        clearTimeout(timer.current)
        void link.executeCommand({ type: 'clipboard.write', text: account.address })
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }}
      onOpenAccounts={() =>
        overlay.type === 'accounts' ? closeOverlay() : openOverlay({ type: 'accounts' })
      }
      onOpenMenu={() => (overlay.type === 'menu' ? closeOverlay() : openOverlay({ type: 'menu' }))}
      onReceive={() => account && openOverlay({ type: 'receive', accountId: account.id })}
    />
  )
}
