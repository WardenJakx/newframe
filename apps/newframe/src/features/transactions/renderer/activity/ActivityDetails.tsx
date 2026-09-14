import { useShallow } from 'zustand/react/shallow'

import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../../shared/renderer/ui/signerPresentation'
import type { ActivityCapability } from './activityCapability'
import { ActivityDetailsView } from './ActivityDetailsView'
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
      const projected = activity ? projectActivityRecord(activity) : undefined
      const chainId = Number(activity?.chainId)
      const origin = typeof activity?.origin === 'string' ? activity.origin : ''
      const networks = state.networks?.ethereum || EMPTY_NETWORKS
      const networksMeta = state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA
      return {
        activity,
        fromAccountType: accountDisplayType(
          Object.values(state.accounts).find(
            (account) =>
              account.address.toLowerCase() ===
              (projected?.data?.from || projected?.account || projected?.address)?.toLowerCase()
          )
        ),
        toAccountType: accountDisplayType(
          Object.values(state.accounts).find(
            (account) => account.address.toLowerCase() === projected?.data?.to?.toLowerCase()
          )
        ),
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
