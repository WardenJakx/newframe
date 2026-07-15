import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { ActivityDetailsView } from './ActivityDetailsView'

const EMPTY_RECORD: Record<string, any> = {}

export function ActivityDetails({ activityId }: { activityId: string }) {
  const shared = useWalletSelector(
    useShallow((state) => {
      const activity = state.activity?.[activityId]
      const chainId = Number(activity?.chainId)
      const origin = typeof activity?.origin === 'string' ? activity.origin : ''
      const networks = state.networks?.ethereum || EMPTY_RECORD
      const networksMeta = state.networksMeta?.ethereum || EMPTY_RECORD
      return {
        activity,
        network: networks[chainId] || {},
        networkMeta: networksMeta[chainId] || {},
        originName: origin ? state.origins?.[origin]?.name || origin : ''
      }
    })
  )
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  if (!shared.activity) return null

  return <ActivityDetailsView {...shared} onBack={closeOverlay} />
}
