import { expect, it } from 'bun:test'

import createInitialState from '../store/state'
import { projectSideTrayState, projectWalletState } from './projections'
import { DEFAULT_PROFILE_ID } from '../../domain/state/main'

const operation = (id: string) => ({
  id,
  type: 'transaction.submit',
  status: 'pending' as const,
  startedAt: 1,
  updatedAt: 1
})

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

it('projects safe principal-owned operations and notification presentation', () => {
  const operationState = createInitialState()
  operationState.operations = {
    own: {
      owner: { clientType: 'wallet-ui', windowInstanceId: 'wallet-one' },
      operation: operation('own')
    },
    otherWindow: {
      owner: { clientType: 'wallet-ui', windowInstanceId: 'wallet-two' },
      operation: operation('otherWindow')
    },
    otherRole: {
      owner: { clientType: 'sidetray', windowInstanceId: 'wallet-one' },
      operation: operation('otherRole')
    }
  }

  const audience = { clientType: 'wallet-ui', windowInstanceId: 'wallet-one' } as const
  const first = projectWalletState(operationState, audience)
  expect(first.operations).toEqual({ own: operation('own') })
  expect(first.operations.own).not.toHaveProperty('owner')
  expect(projectWalletState(operationState, audience).operations).toBe(first.operations)
  expect(
    projectSideTrayState(operationState, {
      clientType: 'sidetray',
      windowInstanceId: 'wallet-one'
    }).operations
  ).toEqual({ otherRole: operation('otherRole') })

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

  state.main.orders = {
    'order-private': {
      orderId: 'order-private',
      accountAddress: '0x1111111111111111111111111111111111111111',
      provider: 'flash',
      status: 'open',
      rawStatus: 'OPEN',
      orderType: 'market',
      side: 'buy',
      targetAsset: { symbol: 'WETH', chainId: 1, typedData: 'must-not-cross' },
      contraAsset: { symbol: 'USDC', chainId: 1, calldata: 'must-not-cross' },
      qty: '1',
      spentAmount: '1',
      outputAmount: '2',
      estimatedOutputAmount: '2',
      filledOutputAmount: '0',
      averageFillPrice: null,
      createdAt: 1,
      updatedAt: 2,
      terminalAt: null,
      rawPayload: {
        signature: '0xprivate',
        typedData: { domain: { chainId: 1 } },
        actions: { approval: { tx: { data: '0x095ea7b3' } } },
        submission: { quote: 'full-private-payload' }
      },
      rawStatusPayload: { signature: '0xprivate-status', response: { private: true } }
    }
  }
  const projectedOrderState = projectWalletState(state)
  const projectedOrder = projectedOrderState.orders['order-private']
  expect(projectedOrder.rawPayload).toEqual({
    orderId: 'order-private',
    provider: 'flash',
    orderType: 'market',
    side: 'buy',
    qty: '1'
  })
  expect(projectedOrder.rawStatusPayload).toMatchObject({
    orderId: 'order-private',
    status: 'open',
    rawStatus: 'OPEN',
    updatedAt: 2
  })
  expect(JSON.stringify(projectedOrder)).not.toMatch(/signature|typedData|calldata|095ea7b3|full-private/i)
  expect(projectWalletState(state).orders).toBe(projectedOrderState.orders)
  expect(
    projectSideTrayState(state, { clientType: 'sidetray', windowInstanceId: 'no-account' }).orders
  ).toEqual({})
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
  state.main.activity = {
    prior: {
      id: 'prior',
      account: activeAccount,
      status: 'succeeded',
      data: { to: unpricedAccount, data: '0x1234', privateTransactionData: true },
      payload: { privateRequestData: true },
      recognizedActions: [
        {
          id: 'erc20:transfer',
          data: { recipient: { address: unpricedAccount, ens: 'private.eth' }, amount: '0x1' }
        }
      ]
    },
    other: {
      id: 'other',
      account: unpricedAccount,
      status: 'succeeded',
      data: { to: activeAccount }
    }
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
  expect(sideTray.activity).toEqual({
    prior: {
      id: 'prior',
      account: activeAccount,
      status: 'succeeded',
      data: { to: unpricedAccount, data: '0x1234' },
      recognizedActions: [{ id: 'erc20:transfer', data: { recipient: { address: unpricedAccount } } }]
    }
  })
  expect(sideTray).not.toHaveProperty('profiles')
})
