import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import { accountDisplayType } from '../../shared/ui/signerPresentation.ts'
import type { ActivityCapability } from './activityCapability.ts'
import { ActivityDetailsView } from './ActivityDetailsView.tsx'
import { projectActivityRecord } from './activityTypes.ts'

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
        chain: state.chains.ethereum[chainId],
        chainMeta: state.chainsMeta.ethereum[chainId],
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
