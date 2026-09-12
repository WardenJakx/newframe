import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useShallow } from 'zustand/react/shallow'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { ChainIcon } from '../../../../../shared/renderer/ui/ChainIcon'
import StatusGlyph from '../../../../../shared/renderer/ui/StatusGlyph'
import type { HomeCapability } from '../homeCapability'
import { useHomeUiStore } from '../state/HomeUiProvider'
import StatusNotifications from '../StatusNotifications'

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

export function HomeNotifications({
  capability
}: {
  capability: Pick<HomeCapability, 'selectAccount' | 'updateNotification'>
}) {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      const requests = account?.requests || EMPTY_REQUESTS
      const deployments = Object.values(account?.safe || {})
      return {
        currentAccount: state.currentAccount || '',
        networks: state.networks?.ethereum || EMPTY_NETWORKS,
        networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
        notifications: state.view?.notifications || EMPTY_NOTIFICATIONS,
        hasSafeQueueError: deployments.some((deployment) => deployment.error),
        requestCount:
          Object.values(requests).filter((request) => request.mode === 'normal').length +
          deployments.reduce((count, deployment) => count + (deployment.pending?.length || 0), 0)
      }
    })
  )
  const setSection = useHomeUiStore((state) => state.setSection)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const requestLabel = `${shared.requestCount} pending ${shared.requestCount === 1 ? 'request' : 'requests'}`

  return (
    <>
      {shared.requestCount > 0 ? (
        <section aria-label='Pending requests' className={requestNotificationRecipe()}>
          <Button
            appearance='primary'
            hasPopup='dialog'
            label={requestLabel}
            onPress={() => openOverlay({ type: 'requests' })}
            shape='control'
            size='large'
            width='full'
          >
            <span className={requestNotificationContentRecipe()}>
              <Icon name='inbox' size='medium' />
              <Text align='center' tone='inverse' variant='action'>
                {requestLabel}
              </Text>
              <Icon name='arrowRight' size='small' />
            </span>
          </Button>
        </section>
      ) : null}
      {shared.hasSafeQueueError ? (
        <section aria-label='Safe queue warning' className={requestNotificationRecipe()} role='alert'>
          <Button
            appearance='danger'
            hasPopup='dialog'
            label='Open Safe requests'
            onPress={() => openOverlay({ type: 'requests' })}
            shape='control'
            size='large'
            width='full'
          >
            <span className={requestNotificationContentRecipe()}>
              <StatusGlyph size='small' state='failed' />
              <Stack gap='none'>
                <Text align='center' variant='action'>
                  Safe requests may be outdated
                </Text>
                <Text align='center' variant='caption'>
                  Open requests to retry
                </Text>
              </Stack>
              <Icon name='arrowRight' size='small' />
            </span>
          </Button>
        </section>
      ) : null}
      <StatusNotifications
        notifications={shared.notifications}
        onDismiss={(id) => void capability.updateNotification({ notificationId: id, action: 'dismiss' })}
        onExpire={(id) => void capability.updateNotification({ notificationId: id, action: 'expire' })}
        onOpen={(notification) => {
          const target = notification.target || {}
          if (typeof target.account === 'string' && target.account !== shared.currentAccount) {
            void capability.selectAccount({ accountId: target.account })
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
