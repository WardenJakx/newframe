import { expect, it } from 'bun:test'

import createInitialState from '../store/state'
import { projectWalletState } from './projections'

it('projects notification presentation and navigation fields without canonical-only data', () => {
  const state = createInitialState()
  state.view.notifications = {
    'flash-order:order-1': {
      id: 'flash-order:order-1',
      state: 'pending',
      title: 'Buy WETH Market Order',
      detail: '1 USDC -> 0.0003 WETH',
      createdAt: 100,
      updatedAt: 200,
      expiresAt: 300,
      leadingIcon: { chainId: 1, chainType: 'ethereum', privateIconState: 'must-not-cross-ipc' },
      target: {
        type: 'flashOrder',
        orderId: 'order-1',
        account: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        privateTargetState: 'must-not-cross-ipc'
      },
      metadata: {
        orderId: 'order-1',
        status: 'open',
        privateMetadata: 'must-not-cross-ipc'
      },
      privateNotificationState: 'must-not-cross-ipc'
    }
  }

  expect(projectWalletState(state).view.notifications).toEqual({
    'flash-order:order-1': {
      id: 'flash-order:order-1',
      state: 'pending',
      title: 'Buy WETH Market Order',
      detail: '1 USDC -> 0.0003 WETH',
      createdAt: 100,
      updatedAt: 200,
      expiresAt: 300,
      leadingIcon: { chainId: 1, chainType: 'ethereum' },
      target: {
        type: 'flashOrder',
        orderId: 'order-1',
        account: '0x1111111111111111111111111111111111111111',
        chainId: 1
      },
      metadata: { orderId: 'order-1', status: 'open' }
    }
  })
})
