import { useShallow } from 'zustand/react/shallow'

import Account from './Account'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'

const selectCurrentAccount = (state: TrayRendererState) => {
  const current = state.currentAccount

  return {
    account: state.accounts[current],
    current,
    open: state.selected.open
  }
}

export default function Main() {
  const { account, current, open } = useWalletSelector(useShallow(selectCurrentAccount))
  if (!open) return null
  if (!account) return null

  return <Account key={current} {...account} index={1} />
}
