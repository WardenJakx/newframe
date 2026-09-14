import { expect, it } from 'bun:test'

import { DEFAULT_PROFILE_ID } from '../../../app/contracts/state/main'
import type { SafeDeployment } from '../../../features/accounts/domain/safe'
import createInitialState from '../../state-store/state'
import { projectionStateSchemas } from '../contract/projections'
import { projectSideTrayState, projectWalletState } from './projections'

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

const safeAddress = `0x${'1'.repeat(40)}`
const ownerAddress = `0x${'ab'.repeat(20)}`
const otherOwnerAddress = `0x${'2'.repeat(40)}`
const safeDeployment = (chainId: number, owners: string[]): SafeDeployment => ({
  chainId,
  address: safeAddress,
  configuration: { owners, threshold: 1, nonce: '0' },
  refreshedAt: 1,
  error: 'Refresh failed'
})
const signer = (id: string, type: string, status = 'ok') => ({
  id,
  name: id,
  model: type,
  type,
  status,
  addresses: [ownerAddress],
  appVersion: { major: 1, minor: 0, patch: 0 }
})

it('projects same-profile owner accounts per deployment from retained snapshots without changing identity', () => {
  const state = createInitialState()
  const chain10Owner = `0x${'3'.repeat(40)}`
  state.main.appLock = { locked: false, vaultExists: true }
  state.main.currentAccount = safeAddress
  state.main.accounts = {
    [safeAddress]: {
      ...account(safeAddress, DEFAULT_PROFILE_ID),
      signer: 'safe-watch',
      safe: {
        '1': safeDeployment(1, [ownerAddress, otherOwnerAddress, safeAddress]),
        '10': safeDeployment(10, [chain10Owner])
      }
    },
    [ownerAddress]: {
      ...account(ownerAddress, DEFAULT_PROFILE_ID),
      address: `0x${'AB'.repeat(20)}`,
      name: 'First owner',
      signer: 'hot'
    },
    [otherOwnerAddress]: { ...account(otherOwnerAddress, DEFAULT_PROFILE_ID), signer: 'hardware' },
    [chain10Owner]: account(chain10Owner, DEFAULT_PROFILE_ID),
    foreign: { ...account('foreign', 'other-profile'), address: ownerAddress, signer: 'hot' },
    nested: {
      ...account('nested', DEFAULT_PROFILE_ID),
      address: ownerAddress,
      signer: 'hot',
      safe: { '1': safeDeployment(1, [otherOwnerAddress]) }
    },
    emptySafe: { ...account('emptySafe', DEFAULT_PROFILE_ID), address: ownerAddress, signer: 'hot', safe: {} }
  }
  state.main.accountOrder = [safeAddress, ownerAddress]
  state.main.signers = {
    hot: signer('hot', 'seed'),
    hardware: { ...signer('hardware', 'ledger'), addresses: [otherOwnerAddress] }
  }
  const wallet = projectWalletState(state)
  const owners = wallet.accounts[safeAddress].safeOwners
  expect(owners?.['1'].map((owner) => [owner.accountId, owner.status])).toEqual([
    [ownerAddress, 'ready'],
    [otherOwnerAddress, 'ready']
  ])
  expect(owners?.['10'].map((owner) => [owner.accountId, owner.status])).toEqual([
    [chain10Owner, 'watch-only']
  ])
  expect(owners?.['1'][0]).toMatchObject({
    name: 'First owner',
    created: 'test:1',
    signerType: 'seed',
    signerAttached: true
  })
  expect(owners?.['10'][0].signerAttached).toBe(false)
  expect(wallet.accounts[safeAddress].safe?.['1'].error).toBe('Refresh failed')
  expect(wallet.currentAccount).toBe(safeAddress)
  expect(wallet.accounts[safeAddress].signer).toBe('safe-watch')
  expect(wallet.accounts[ownerAddress] as unknown).toBe(state.main.accounts[ownerAddress])
  expect(state.main.accounts[safeAddress]).not.toHaveProperty('safeOwners')
  expect(
    projectionStateSchemas['wallet-ui'].parse(JSON.parse(JSON.stringify(wallet))).accounts[safeAddress]
      .safeOwners
  ).toEqual(owners)
})

it('distinguishes ready signers, unavailable signing accounts, and watch-only owners', () => {
  const cases = [
    { id: 'seed', type: 'seed', expected: 'ready', signerAttached: true },
    { id: 'ring', type: 'ring', expected: 'ready', signerAttached: true },
    { id: 'ledger', type: 'Ledger', expected: 'ready', signerAttached: true },
    { id: 'trezor', type: 'trezor', expected: 'ready', signerAttached: true },
    { id: 'lattice', type: 'lattice', expected: 'ready', signerAttached: true },
    { id: 'airgap', type: 'airgap', expected: 'ready', signerAttached: true },
    { id: 'locked', type: 'seed', status: 'locked', expected: 'unavailable', signerAttached: true },
    {
      id: 'disconnected',
      type: 'ledger',
      status: 'disconnected',
      expected: 'unavailable',
      signerAttached: true
    },
    { id: 'missing', type: 'seed', attached: 'missing', expected: 'unavailable', signerAttached: false },
    { id: 'historical', type: 'Ledger', attached: '', expected: 'unavailable', signerAttached: false },
    { id: 'unknown', type: '', attached: '', expected: 'watch-only', signerAttached: false },
    { id: 'watch', type: 'Address', expected: 'watch-only', signerAttached: false }
  ]
  const state = createInitialState()
  state.main.appLock = { locked: false, vaultExists: true }
  state.main.accounts = {
    [safeAddress]: {
      ...account(safeAddress, DEFAULT_PROFILE_ID),
      safe: { '1': safeDeployment(1, [ownerAddress]) }
    },
    ...Object.fromEntries(
      cases.map((item) => [
        item.id,
        {
          ...account(item.id, DEFAULT_PROFILE_ID),
          address: ownerAddress,
          lastSignerType: item.type,
          signer: item.attached ?? item.id
        }
      ])
    )
  }
  state.main.signers = Object.fromEntries(
    cases
      .filter((item) => item.attached === undefined)
      .map((item) => [item.id, signer(item.id, item.type, item.status)])
  )
  const owners = projectWalletState(state).accounts[safeAddress].safeOwners!['1']
  expect(owners.map((owner) => [owner.accountId, owner.status, owner.signerAttached])).toEqual(
    cases.map((item) => [item.id, item.expected, item.signerAttached])
  )
  expect(owners.find((owner) => owner.accountId === 'locked')?.signerStatus).toBe('locked')
  expect(owners.find((owner) => owner.accountId === 'historical')?.signerType).toBe('ledger')
  expect(owners.find((owner) => owner.accountId === 'missing')?.signerStatus).toBe('Signer unavailable')
})

it('recomputes owner readiness for signer and app-lock updates and removes invalid associations', () => {
  const state = createInitialState()
  state.main.appLock = { locked: false, vaultExists: true }
  state.main.accounts = {
    [safeAddress]: {
      ...account(safeAddress, DEFAULT_PROFILE_ID),
      safe: { '1': safeDeployment(1, [ownerAddress]) }
    },
    owner: {
      ...account('owner', DEFAULT_PROFILE_ID),
      address: ownerAddress,
      signer: 'hot',
      lastSignerType: 'seed'
    }
  }
  state.main.signers = { hot: signer('hot', 'seed') }
  const first = projectWalletState(state)
  expect(projectWalletState(state).accounts).toBe(first.accounts)
  state.main.appLock = { ...state.main.appLock, locked: true }
  const locked = projectWalletState(state)
  expect(locked.accounts[safeAddress].safeOwners?.['1'][0]).toMatchObject({
    status: 'unavailable',
    signerAttached: true,
    signerStatus: 'Wallet locked'
  })
  expect(locked.accounts.owner).toBe(first.accounts.owner)
  state.main.appLock = { ...state.main.appLock, locked: false }
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1'][0].status).toBe('ready')
  state.main.signers = { hot: signer('hot', 'seed', 'locked') }
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1'][0]).toMatchObject({
    status: 'unavailable',
    signerAttached: true,
    signerStatus: 'locked'
  })
  state.main.signers = {}
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1'][0]).toMatchObject({
    status: 'unavailable',
    signerAttached: false,
    signerStatus: 'Signer unavailable'
  })
  state.main.accounts = {
    ...state.main.accounts,
    owner: { ...state.main.accounts.owner, profileId: 'foreign' }
  }
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1']).toEqual([])
  state.main.accounts = {
    ...state.main.accounts,
    owner: { ...state.main.accounts.owner, profileId: DEFAULT_PROFILE_ID }
  }
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1']).toHaveLength(1)
  state.main.accounts = {
    ...state.main.accounts,
    [safeAddress]: {
      ...state.main.accounts[safeAddress],
      safe: { '1': safeDeployment(1, [otherOwnerAddress]) }
    }
  }
  expect(projectWalletState(state).accounts[safeAddress].safeOwners?.['1']).toEqual([])
  state.main.currentProfile = 'foreign'
  expect(projectWalletState(state).accounts).not.toHaveProperty(safeAddress)
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
      lastSignerType: 'address',
      accountType: 'address'
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

it('projects Safe display type without changing signer history', () => {
  for (const lastSignerType of ['Address', 'seed', 'ledger']) {
    const state = createInitialState()
    state.main.accounts = {
      [safeAddress]: {
        ...account(safeAddress, DEFAULT_PROFILE_ID),
        lastSignerType,
        safe: { '1': safeDeployment(1, [ownerAddress]) }
      },
      [ownerAddress]: {
        ...account(ownerAddress, DEFAULT_PROFILE_ID),
        lastSignerType,
        safe: {}
      }
    }
    state.main.accountOrder = [safeAddress, ownerAddress]
    const projected = projectSideTrayState(state).accounts
    expect(projected[safeAddress]).toMatchObject({ accountType: 'safe', lastSignerType })
    expect(projected[ownerAddress]).toMatchObject({ accountType: lastSignerType, lastSignerType })
  }
})
