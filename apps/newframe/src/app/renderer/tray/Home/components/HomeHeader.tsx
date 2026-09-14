import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../../../shared/renderer/ui/signerPresentation'
import type { HomeCapability } from '../homeCapability'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { HomeHeaderView } from './HomeHeaderView'

export function HomeHeader({ capability }: { capability: Pick<HomeCapability, 'copyText'> }) {
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
  const type = accountDisplayType(account)
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
      accountType={type}
      icon='accounts'
      menuOpen={overlay.type === 'menu'}
      name={name}
      onCopy={() => {
        if (!account) return
        clearTimeout(timer.current)
        void capability.copyText({ text: account.address })
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
