import React from 'react'

import { useHomeUiStore } from './state/HomeUiProvider'
import { Positions } from './features/positions/Positions'
import { Activity } from './features/activity/Activity'
import { Orders } from './features/orders/Orders'

export function HomeSectionRouter() {
  const section = useHomeUiStore((state) => state.section)
  if (section === 'positions') return <Positions />

  return <div className='t2Main'>{section === 'activity' ? <Activity /> : <Orders />}</div>
}
