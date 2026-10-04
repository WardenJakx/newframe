import { cva } from '../../../../generated/styled-system/css/cva.js'
import { Activity } from '../../features/activity/Activity.tsx'
import type { ActivityCapability } from '../../features/activity/activityCapability.ts'
import type { PortfolioCapability } from '../../features/portfolio/portfolioCapability.ts'
import { Positions } from '../../features/portfolio/Positions.tsx'
import { Orders } from '../../features/trading/orders/Orders.tsx'
import type { OrdersCapability } from '../../features/trading/orders/ordersCapability.ts'
import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import { useHomeUiStore } from './state/HomeUiProvider.tsx'

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
          if (currentAccount) {
            openOverlay({ type: 'asset', accountId: currentAccount, asset })
          }
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
