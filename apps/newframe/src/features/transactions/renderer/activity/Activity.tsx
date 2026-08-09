import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { createActivityRows } from './activityModel'
import { ActivityView } from './ActivityView'
import type { ActivityCapability } from './activityCapability'
import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'

const EMPTY_ACTIVITY: WalletRendererState['activity'] = {}
const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}

export function Activity({
  capability,
  onOpenActivity,
  selectedChainId
}: {
  capability: Pick<ActivityCapability, 'hydrateTokenImage' | 'openExplorer' | 'writeText'>
  onOpenActivity: (activityId: string) => void
  selectedChainId: number
}) {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      return {
        accountAddress: account?.address || '',
        activity: state.activity || EMPTY_ACTIVITY,
        networks: state.networks?.ethereum || EMPTY_NETWORKS,
        networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
        tokens: state.tokens || { byId: {}, accountTokenIds: {} },
        showTestnets: !!state.showTestnets
      }
    })
  )
  const activity = createActivityRows({ ...shared, selectedChainId })

  return (
    <ActivityView
      activity={activity}
      clipboard={capability}
      imageCapability={capability}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      tokens={shared.tokens}
      onOpen={onOpenActivity}
      onOpenExplorer={(record) => {
        if (!record.hash) return
        void capability.openExplorer({
          chainId: Number(record.chainId),
          transactionHash: record.hash
        })
      }}
    />
  )
}
