import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../resources/link'
import { useWalletSelector } from '../../../state/useAppSelector'
import { useHomeUiStore } from '../state/HomeUiProvider'
import type { PendingAddChain, ProposedChain } from '../state/homeUiTypes'

interface HomeCommandData extends PendingAddChain {
  newChain?: ProposedChain
  selectedChain?: ProposedChain
  showAddAccounts?: boolean
  newAccountType?: string
  selectedSigner?: string
}

interface HomeCommand {
  id: number
  view: string
  data?: HomeCommandData
}

export function useHomeCommand() {
  const shared = useWalletSelector(
    useShallow((state) => ({
      accounts: state.accounts,
      currentAccount: state.currentAccount || '',
      homeCommand: state.tray?.homeCommand,
      selectedOpen: !!state.selected?.open
    }))
  )
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const setSelectedChainId = useHomeUiStore((state) => state.setSelectedChainId)
  const lastCommandId = useRef(0)

  useEffect(() => {
    if (shared.currentAccount && shared.selectedOpen) return
    const accountId = shared.currentAccount || Object.keys(shared.accounts || {})[0]
    if (accountId) void link.executeCommand({ type: 'account.select', accountId })
  }, [shared.accounts, shared.currentAccount, shared.selectedOpen])

  useEffect(() => {
    const command = shared.homeCommand as HomeCommand | null
    if (!command || command.id === lastCommandId.current) return
    lastCommandId.current = command.id
    const { data = {}, view } = command

    if (view === 'settings') openOverlay({ type: 'settings' })
    if (view === 'accounts') {
      openOverlay({
        type: 'accounts',
        showAddAccounts: !!data.showAddAccounts,
        newAccountType: data.newAccountType,
        selectedSigner: data.selectedSigner
      })
    }
    if (view === 'networks') {
      if (data.newChain && Object.keys(data.newChain).length) {
        openOverlay({
          type: 'addChain',
          pending: { chain: data.newChain, homeCommandId: command.id }
        })
      } else {
        if (data.selectedChain) {
          setSelectedChainId(Number(data.selectedChain.id || data.selectedChain.chainId))
        }
        openOverlay({ type: 'networks' })
      }
    }
    if (view === 'addChain') {
      openOverlay({
        type: 'addChain',
        pending: { ...data, ...(!data.request ? { homeCommandId: command.id } : {}) }
      })
    }

    const waitsForApproval =
      (view === 'networks' && data.newChain && !data.request) || (view === 'addChain' && !data.request)
    if (!waitsForApproval) {
      void link.executeCommand({ type: 'home.command-consume', commandId: command.id })
    }
  }, [openOverlay, setSelectedChainId, shared.homeCommand])
}
