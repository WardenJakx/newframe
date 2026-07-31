import { expect, it } from 'bun:test'

import createInitialState from '../store/state'
import { projectSideTrayState, projectWalletState } from './projections'
import { DEFAULT_PROFILE_ID } from '../../domain/state/main'

const account = (id: string, profileId: string) => ({
  id,
  profileId,
  address: id,
  name: id,
  lastSignerType: 'address',
  status: 'ok',
  signer: '',
  requests: {},
  created: 'test:1'
})

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

it('projects only active-profile Accounts and derives ordered cached profile values locally', () => {
  const state = createInitialState()
  const activeAccount = '0x1111111111111111111111111111111111111111'
  const unpricedAccount = '0x2222222222222222222222222222222222222222'
  const pricedToken = '0x00000000000000000000000000000000000000aa'
  const unpricedToken = '0x00000000000000000000000000000000000000bb'
  state.main.profiles = {
    [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
    unpriced: { id: 'unpriced', name: 'Unpriced' },
    empty: { id: 'empty', name: 'Empty' }
  }
  state.main.profileOrder = ['empty', 'unpriced', DEFAULT_PROFILE_ID]
  state.main.currentProfile = DEFAULT_PROFILE_ID
  state.main.accounts = {
    [activeAccount]: account(activeAccount, DEFAULT_PROFILE_ID),
    [unpricedAccount]: account(unpricedAccount, 'unpriced')
  }
  state.main.accountOrder = [unpricedAccount, activeAccount]
  state.main.currentAccount = activeAccount
  state.main.balances = {
    [activeAccount]: [
      { address: pricedToken, chainId: 1, balance: '0x2', displayBalance: '' },
      { address: unpricedToken, chainId: 1, balance: '0x3', displayBalance: '' }
    ],
    [unpricedAccount]: [{ address: unpricedToken, chainId: 1, balance: '0x4', displayBalance: '' }]
  }
  state.main.tokens = {
    byId: {
      [`1:${pricedToken}`]: {
        address: pricedToken,
        chainId: 1,
        decimals: 0,
        name: 'Priced',
        symbol: 'USD',
        custom: false,
        curated: false,
        sources: ['onchain'],
        updatedAt: 1
      },
      [`1:${unpricedToken}`]: {
        address: unpricedToken,
        chainId: 1,
        decimals: 0,
        name: 'Unpriced',
        symbol: 'UNK',
        custom: false,
        curated: false,
        sources: ['onchain'],
        updatedAt: 1
      }
    },
    accountTokenIds: {}
  }
  state.main.assetRates = {
    [`1:${pricedToken}`]: { usdRate: 5, source: 'zerion', observedAt: 1 }
  }

  const wallet = projectWalletState(state)
  expect({
    accounts: wallet.accounts,
    accountOrder: wallet.accountOrder,
    currentProfile: wallet.currentProfile,
    profiles: wallet.profiles
  } as unknown).toEqual({
    accounts: { [activeAccount]: state.main.accounts[activeAccount] },
    accountOrder: [activeAccount],
    currentProfile: DEFAULT_PROFILE_ID,
    profiles: [
      { id: 'empty', name: 'Empty', accountCount: 0, cachedValue: { state: 'missing' } },
      { id: 'unpriced', name: 'Unpriced', accountCount: 1, cachedValue: { state: 'unpriced' } },
      {
        id: DEFAULT_PROFILE_ID,
        name: 'Profile 1',
        accountCount: 1,
        cachedValue: { state: 'priced', value: 10 }
      }
    ]
  })

  const sideTray = projectSideTrayState(state)
  expect(sideTray.accounts).toEqual({
    [activeAccount]: {
      id: activeAccount,
      address: activeAccount,
      name: activeAccount,
      lastSignerType: 'address'
    }
  })
  expect(sideTray.accountOrder).toEqual([activeAccount])
  expect(sideTray.balances).toEqual({ [activeAccount]: state.main.balances[activeAccount] })
  expect(sideTray).not.toHaveProperty('profiles')
})
