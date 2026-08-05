import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { createActivityRows } from './activityModel'
import { ActivityView } from './ActivityView'
import link from '../../../../shared/link'

const EMPTY_RECORD: Record<string, any> = {}

export function Activity() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      return {
        accountAddress: account?.address || '',
        activity: state.activity || EMPTY_RECORD,
        networks: state.networks?.ethereum || EMPTY_RECORD,
        networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
        tokens: state.tokens || { byId: {}, accountTokenIds: {} },
        showTestnets: !!state.showTestnets
      }
    })
  )
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const activity = createActivityRows({ ...shared, selectedChainId })

  return (
    <ActivityView
      activity={activity}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      tokens={shared.tokens}
      onOpen={(activityId) => openOverlay({ type: 'activity', activityId })}
      onOpenExplorer={(record) => {
        if (!record.hash) return
        void link.executeCommand({
          type: 'explorer.open',
          chainId: Number(record.chainId),
          transactionHash: record.hash
        })
      }}
    />
  )
}
