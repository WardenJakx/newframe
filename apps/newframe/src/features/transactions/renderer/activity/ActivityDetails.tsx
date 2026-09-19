import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../../shared/renderer/ui/signerPresentation'
import type { ActivityCapability } from './activityCapability'
import { ActivityDetailsView } from './ActivityDetailsView'
import { projectActivityRecord } from './activityTypes'

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
      const activity = (state.activity as Partial<typeof state.activity>)[activityId]
      const projected = activity ? projectActivityRecord(activity) : undefined
      const chainId = Number(activity?.chainId)
      const origin = typeof activity?.origin === 'string' ? activity.origin : ''
      const origins: Partial<typeof state.origins> = state.origins
      return {
        activity,
        fromAccountType: accountDisplayType(
          Object.values(state.accounts).find(
            (account) =>
              account.address.toLowerCase() ===
              (projected?.data?.from ?? projected?.account ?? projected?.address)?.toLowerCase()
          )
        ),
        toAccountType: accountDisplayType(
          Object.values(state.accounts).find(
            (account) => account.address.toLowerCase() === projected?.data?.to?.toLowerCase()
          )
        ),
        network: state.networks.ethereum[chainId],
        networkMeta: state.networksMeta.ethereum[chainId],
        originName: origin ? (origins[origin]?.name ?? origin) : ''
      }
    })
  )
  if (!shared.activity) {
    return null
  }

  return (
    <ActivityDetailsView
      {...shared}
      activity={projectActivityRecord(shared.activity)}
      capability={capability}
      onBack={onBack}
    />
  )
}
