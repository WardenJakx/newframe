import { useHomeUiStore } from './state/HomeUiProvider'
import { Positions } from '../../../../features/portfolio/renderer/Positions'
import { Activity } from '../../../../features/transactions/renderer/activity/Activity'
import { Orders } from '../../../../features/transactions/trade/renderer/orders/Orders'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import type { ActivityCapability } from '../../../../features/transactions/renderer/activity/activityCapability'
import type { OrdersCapability } from '../../../../features/transactions/trade/renderer/orders/ordersCapability'
import type { PortfolioCapability } from '../../../../features/portfolio/renderer/portfolioCapability'

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

export function HomeSectionRouter({
  activity,
  orders,
  portfolio
}: {
  activity: ActivityCapability
  orders: OrdersCapability
  portfolio: PortfolioCapability
}) {
  const section = useHomeUiStore((state) => state.section)
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const currentAccount = useWalletSelector((state) => state.currentAccount || '')
  if (section === 'positions') {
    return (
      <Positions
        capability={portfolio}
        onOpenAsset={(asset) => {
          if (currentAccount) openOverlay({ type: 'asset', accountId: currentAccount, asset })
        }}
        selectedChainId={selectedChainId}
      />
    )
  }

  return (
    <main className={mainRecipe()}>
      {section === 'activity' ? (
        <Activity
          capability={activity}
          onOpenActivity={(activityId) => openOverlay({ type: 'activity', activityId })}
          selectedChainId={selectedChainId}
        />
      ) : (
        <Orders
          capability={orders}
          onOpenOrder={({ assetImages, orderId }) => openOverlay({ type: 'order', assetImages, orderId })}
          selectedChainId={selectedChainId}
        />
      )}
    </main>
  )
}
