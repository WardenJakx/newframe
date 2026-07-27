import { beforeEach, expect, it } from 'bun:test'

import { render, screen } from '../../../../test/support/componentSetup'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../contracts/state/protocol'
import type { WalletStatusNotification } from '../../../../contracts/state/projections'
import { walletState } from '../../../state/fixtures.test-support'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../state/rendererStore'
import { HomeUiProvider, useHomeUiStore } from '../state/HomeUiProvider'
import { HomeNotifications } from './HomeNotifications'

function NavigationObserver() {
  const section = useHomeUiStore((state) => state.section)
  const overlay = useHomeUiStore((state) => state.overlay)

  return <output>{JSON.stringify({ section, overlay })}</output>
}

function renderNotification(notification: WalletStatusNotification) {
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: `notification-${String(notification.id)}`,
    revision: 0,
    state: walletState({
      currentAccount: '0x1111111111111111111111111111111111111111',
      view: {
        notify: '',
        notifyData: {},
        badge: '',
        notifications: {
          [String(notification.id)]: notification
        }
      }
    })
  })

  return render(
    <HomeUiProvider>
      <HomeNotifications />
      <NavigationObserver />
    </HomeUiProvider>
  )
}

beforeEach(() => {
  resetStateMirrorForTests()
  beginStateConnection('wallet-ui')
})

it('shows order details and opens the referenced order', async () => {
  const { user } = renderNotification({
    id: 'flash-order:order-1',
    state: 'pending',
    title: 'Buy WETH Market Order',
    detail: '1 USDC -> 0.0003 WETH',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    target: {
      type: 'flashOrder',
      orderId: 'order-1',
      account: '0x1111111111111111111111111111111111111111',
      chainId: 1
    }
  })

  expect(screen.getByText('Buy WETH Market Order')).toBeTruthy()
  expect(screen.getByText('1 USDC -> 0.0003 WETH')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: 'Pending Buy WETH Market Order' }))

  expect(screen.getByText('{"section":"orders","overlay":{"type":"order","orderId":"order-1"}}')).toBeTruthy()
})

it('opens the referenced transaction activity', async () => {
  const { user } = renderNotification({
    id: 'transaction:0x1234',
    state: 'completed',
    title: 'Send ETH',
    detail: '0x1234...cdef',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    target: {
      type: 'transactionActivity',
      activityId: 'transaction:0x1234',
      account: '0x1111111111111111111111111111111111111111',
      chainId: 1
    }
  })

  await user.click(screen.getByRole('button', { name: 'Confirmed Send ETH' }))

  expect(
    screen.getByText('{"section":"activity","overlay":{"type":"activity","activityId":"transaction:0x1234"}}')
  ).toBeTruthy()
})
