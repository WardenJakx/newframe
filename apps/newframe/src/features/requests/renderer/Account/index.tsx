import { useShallow } from 'zustand/react/shallow'

import Account from './Account'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import type { RequestRendererCapabilities } from '../requestCapabilities'

const selectCurrentAccount = (state: WalletRendererState) => {
  const current = state.currentAccount

  return {
    account: state.accounts[current],
    current,
    open: state.selected.open
  }
}

export default function Main({ capabilities }: { capabilities: RequestRendererCapabilities }) {
  const { account, current, open } = useWalletSelector(useShallow(selectCurrentAccount))
  if (!open) return null
  if (!account) return null

  return <Account capabilities={capabilities} key={current} {...account} index={1} />
}
