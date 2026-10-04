import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../shared/projection/useAppSelector.tsx'
import { accountDisplayType } from '../../../shared/ui/signerPresentation.ts'
import type { HomeCapability } from '../homeCapability.ts'
import { useHomeUiStore } from '../state/HomeUiProvider.tsx'
import { HomeHeaderView } from './HomeHeaderView.tsx'

export function HomeHeader({ capability }: { capability: Pick<HomeCapability, 'copyText'> }) {
  const { account, showLocalNameWithENS, tor } = useWalletSelector(
    useShallow((state) => {
      const accounts: Partial<typeof state.accounts> = state.accounts
      return {
        account: accounts[state.currentAccount],
        tor: state.tor,
        showLocalNameWithENS: !!state.showLocalNameWithENS
      }
    })
  )
  const overlay = useHomeUiStore((state) => state.overlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const type = accountDisplayType(account)
  let name = 'Add Account'
  if (account) {
    name = account.ensName && !showLocalNameWithENS ? account.ensName : account.name
  }

  return (
    <HomeHeaderView
      account={account}
      accountsOpen={overlay.type === 'accounts'}
      copied={copied}
      accountType={type}
      icon='accounts'
      menuOpen={overlay.type === 'menu'}
      tor={tor}
      onOpenSettings={() => openOverlay({ type: 'settings' })}
      name={name}
      onCopy={() => {
        if (!account) {
          return
        }
        clearTimeout(timer.current)
        void capability.copyText({ text: account.address })
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }}
      onOpenAccounts={() =>
        overlay.type === 'accounts' ? closeOverlay() : openOverlay({ type: 'accounts' })
      }
      onOpenMenu={() => (overlay.type === 'menu' ? closeOverlay() : openOverlay({ type: 'menu' }))}
      onReceive={() => {
        if (account) {
          openOverlay({ type: 'receive', accountId: account.id })
        }
      }}
    />
  )
}
