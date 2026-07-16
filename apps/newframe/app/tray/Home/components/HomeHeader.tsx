import { useEffect, useRef, useState } from 'react'
import type { IconName } from '@newframe/ui/icon'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../resources/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeHeaderView } from './HomeHeaderView'

function signerIcon(type: string): IconName {
  if ((type || '').toLowerCase() === 'address') return 'eye'
  if (type === 'ledger' || type === 'trezor' || type === 'lattice') return 'device'
  return 'flame'
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
      icon={account ? signerIcon(type) : 'accounts'}
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
