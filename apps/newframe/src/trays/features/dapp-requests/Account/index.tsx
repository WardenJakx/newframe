import type { WalletRendererState } from '@newframe/schema/projections'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../shared/projection/useAppSelector.tsx'
import type { RequestRendererCapabilities } from '../requestCapabilities.ts'
import Account from './Account.tsx'

const selectCurrentAccount = (state: WalletRendererState) => {
  const current = state.currentAccount

  return {
    account: (state.accounts as Partial<typeof state.accounts>)[current],
    current,
    open: state.selected.open
  }
}

export default function Main({
  capabilities,
  accountSelector
}: {
  capabilities: RequestRendererCapabilities
  accountSelector?: ReactNode
}) {
  const { account, current, open } = useWalletSelector(useShallow(selectCurrentAccount))
  if (!open) {
    return null
  }
  if (!account) {
    return null
  }

  return (
    <Account
      capabilities={capabilities}
      accountSelector={accountSelector}
      key={current}
      {...account}
      index={1}
    />
  )
}
