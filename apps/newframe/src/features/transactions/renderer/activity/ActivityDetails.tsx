import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { ActivityDetailsView } from './ActivityDetailsView'
import type { ActivityCapability } from './activityCapability'
import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { projectActivityRecord } from './activityTypes'

const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}

export function ActivityDetails({
  activityId,
  capability,
  onBack
}: {
  activityId: string
  capability: Pick<ActivityCapability, 'copyText' | 'hydrateTokenImage'>
  onBack: () => void
}) {
  const shared = useWalletSelector(
    useShallow((state) => {
      const activity = state.activity?.[activityId]
      const chainId = Number(activity?.chainId)
      const origin = typeof activity?.origin === 'string' ? activity.origin : ''
      const networks = state.networks?.ethereum || EMPTY_NETWORKS
      const networksMeta = state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA
      return {
        activity,
        network: networks[chainId] || {},
        networkMeta: networksMeta[chainId] || {},
        originName: origin ? state.origins?.[origin]?.name || origin : ''
      }
    })
  )
  if (!shared.activity) return null

  return (
    <ActivityDetailsView
      {...shared}
      activity={projectActivityRecord(shared.activity)}
      capability={capability}
      onBack={onBack}
    />
  )
}
