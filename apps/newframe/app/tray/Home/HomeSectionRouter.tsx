import { useHomeUiStore } from './state/HomeUiProvider'
import { Positions } from './features/positions/Positions'
import { Activity } from './features/activity/Activity'
import { Orders } from './features/orders/Orders'
import { cva } from '../../../resources/styled-system/css/cva.js'

const mainRecipe = cva({
  base: {
    position: 'relative',
    zIndex: 'content',
    minHeight: 0,
    flex: 1,
    overflowX: 'hidden',
    overflowY: 'auto',
    paddingInline: '4',
    paddingBlockStart: '1',
    paddingBlockEnd: '7'
  }
})

export function HomeSectionRouter() {
  const section = useHomeUiStore((state) => state.section)
  if (section === 'positions') return <Positions />

  return <main className={mainRecipe()}>{section === 'activity' ? <Activity /> : <Orders />}</main>
}
