import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import type { ActivityCapability } from './activityCapability.ts'
import { createActivityRows } from './activityModel.ts'
import { ActivityView } from './ActivityView.tsx'

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
      const account = (state.accounts as Partial<typeof state.accounts>)[state.currentAccount]
      return {
        accountAddress: account?.address ?? '',
        activity: state.activity,
        chains: state.chains.ethereum,
        chainsMeta: state.chainsMeta.ethereum,
        tokens: state.tokens,
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
      chains={shared.chains}
      chainsMeta={shared.chainsMeta}
      tokens={shared.tokens}
      onOpen={onOpenActivity}
      onOpenExplorer={(record) => {
        if (!record.hash) {
          return
        }
        void capability.openExplorer({
          chainId: Number(record.chainId),
          transactionHash: record.hash
        })
      }}
    />
  )
}
