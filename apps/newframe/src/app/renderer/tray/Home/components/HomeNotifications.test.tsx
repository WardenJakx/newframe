import { beforeEach, expect, it } from 'bun:test'

import { render, screen } from '../../../../../../test/support/componentSetup'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../../platform/state-sync/contract/protocol'
import type {
  WalletRendererState,
  WalletStatusNotification
} from '../../../../../platform/state-sync/contract/projections'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../../platform/state-sync/renderer/rendererStore'
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

it('shows normal requests as a prominent home notification and opens the request panel', async () => {
  const accountId = '0x1111111111111111111111111111111111111111'
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'pending-requests',
    revision: 0,
    state: walletState({
      accounts: {
        [accountId]: {
          id: accountId,
          profileId: 'default-profile',
          address: accountId,
          name: 'Primary',
          lastSignerType: 'address',
          status: 'ok',
          signer: 'watch',
          requests: {
            'request-1': { handlerId: 'request-1', mode: 'normal', type: 'access' },
            'request-2': { handlerId: 'request-2', mode: 'normal', type: 'access' },
            monitor: { handlerId: 'monitor', mode: 'monitor', type: 'transaction' }
          },
          created: '2026-01-01T00:00:00.000Z'
        } as unknown as WalletRendererState['accounts'][string]
      },
      currentAccount: accountId
    })
  })

  const { user } = render(
    <HomeUiProvider>
      <HomeNotifications />
      <NavigationObserver />
    </HomeUiProvider>
  )

  await user.click(screen.getByRole('button', { name: '2 pending requests' }))

  expect(screen.getByText('{"section":"positions","overlay":{"type":"requests"}}')).toBeTruthy()
})

it('does not show a request notification when there are no actionable requests', () => {
  const accountId = '0x1111111111111111111111111111111111111111'
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'no-pending-requests',
    revision: 0,
    state: walletState({
      accounts: {
        [accountId]: {
          id: accountId,
          profileId: 'default-profile',
          address: accountId,
          name: 'Primary',
          lastSignerType: 'address',
          status: 'ok',
          signer: 'watch',
          requests: { monitor: { handlerId: 'monitor', mode: 'monitor', type: 'transaction' } },
          created: '2026-01-01T00:00:00.000Z'
        } as unknown as WalletRendererState['accounts'][string]
      },
      currentAccount: accountId
    })
  })

  render(
    <HomeUiProvider>
      <HomeNotifications />
    </HomeUiProvider>
  )

  expect(screen.queryByLabelText('Pending requests')).toBeNull()
})
