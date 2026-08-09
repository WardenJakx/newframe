import { useShallow } from 'zustand/react/shallow'
import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Text } from '@newframe/ui/text'

import link from '../../../../../platform/ipc/renderer/link'
import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import StatusNotifications from '../StatusNotifications'
import { useHomeUiStore } from '../state/HomeUiProvider'
import { ChainIcon } from './ChainIcon'
import { cva } from '../../../../../../generated/styled-system/css/cva.js'

const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}
const EMPTY_NOTIFICATIONS: WalletRendererState['view']['notifications'] = {}
const EMPTY_REQUESTS: WalletRendererState['accounts'][string]['requests'] = {}

const requestNotificationRecipe = cva({
  base: {
    position: 'relative',
    zIndex: 'content',
    flexShrink: 0,
    paddingBlockStart: '4',
    paddingInline: '6'
  }
})

const requestNotificationContentRecipe = cva({
  base: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: '20px minmax(0, 1fr) 20px',
    alignItems: 'center',
    gap: '4'
  }
})

export function HomeNotifications() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const requests = state.accounts?.[state.currentAccount]?.requests || EMPTY_REQUESTS
      return {
        currentAccount: state.currentAccount || '',
        networks: state.networks?.ethereum || EMPTY_NETWORKS,
        networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
        notifications: state.view?.notifications || EMPTY_NOTIFICATIONS,
        requestCount: Object.values(requests).filter((request) => request.mode === 'normal').length
      }
    })
  )
  const setSection = useHomeUiStore((state) => state.setSection)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)

  return (
    <>
      {shared.requestCount > 0 ? (
        <section aria-label='Pending requests' className={requestNotificationRecipe()}>
          <Button
            appearance='primary'
            hasPopup='dialog'
            label={`${shared.requestCount} pending ${shared.requestCount === 1 ? 'request' : 'requests'}`}
            onPress={() => openOverlay({ type: 'requests' })}
            shape='control'
            size='large'
            width='full'
          >
            <span className={requestNotificationContentRecipe()}>
              <Icon name='inbox' size='medium' />
              <Text align='center' tone='inverse' variant='action'>
                {shared.requestCount} pending {shared.requestCount === 1 ? 'request' : 'requests'}
              </Text>
              <Icon name='arrowRight' size='small' />
            </span>
          </Button>
        </section>
      ) : null}
      <StatusNotifications
        notifications={shared.notifications}
        onDismiss={(id) =>
          void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'dismiss' })
        }
        onExpire={(id) =>
          void link.executeCommand({ type: 'notification.update', notificationId: id, action: 'expire' })
        }
        onOpen={(notification) => {
          const target = notification.target || {}
          if (typeof target.account === 'string' && target.account !== shared.currentAccount) {
            void link.executeCommand({ type: 'account.select', accountId: target.account })
          }

          const orderId = target.orderId || notification.metadata?.orderId
          if (orderId) {
            setSection('orders')
            openOverlay({ type: 'order', orderId })
            return
          }

          const activityId = target.activityId || target.hash || notification.metadata?.hash
          if (!activityId) return
          setSection('activity')
          openOverlay({ type: 'activity', activityId })
        }}
        renderChainIcon={(notification) => {
          const chainId = Number(notification.leadingIcon?.chainId || notification.target?.chainId)
          return chainId ? (
            <ChainIcon
              chainId={chainId}
              networks={shared.networks}
              networksMeta={shared.networksMeta}
              size='medium'
            />
          ) : null
        }}
      />
    </>
  )
}
