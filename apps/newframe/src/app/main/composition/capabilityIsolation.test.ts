import { expect, it, mock } from 'bun:test'

import createCanonicalStore from '../../../platform/state-store/createCanonicalStore'
import {
  createProductionCapabilities,
  createProductionMainApp,
  type ProductionCapabilityAdapters
} from './production'

const memoryStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }

function createAdapters(): ProductionCapabilityAdapters {
  return {
    accountOnboarding: {
      dispose: mock(),
      hardware: {} as never,
      keystore: {} as never,
      secrets: {} as never,
      signers: {} as never
    },
    accounts: { now: () => 42 } as never,
    images: { log: { warn: mock() } } as never,
    network: {} as never,
    platform: {} as never,
    portfolio: {} as never,
    security: {
      vault: { exists: () => false, getKey: () => null, isUnlocked: () => false }
    } as never
  }
}

function graph() {
  const store = createCanonicalStore(memoryStorage).store
  return { store, capabilities: createProductionCapabilities(store, createAdapters()) }
}

it('keeps mutable state, listeners, and deferred capability ports graph-local', async () => {
  const first = graph()
  const second = graph()
  const address = '0x1111111111111111111111111111111111111111'
  first.store.getState().upsertAccount({
    id: address,
    address,
    name: 'First graph',
    lastSignerType: 'Address',
    signer: '',
    signerStatus: '',
    agentEnabled: false
  })
  first.capabilities.settingsService.update({
    type: 'settings.update',
    setting: 'autohide',
    value: true
  })

  const events = [0, 0]
  first.capabilities.accounts.on('isolated', () => events[0]++)
  second.capabilities.accounts.on('isolated', () => events[1]++)
  first.capabilities.accounts.emit('isolated')
  second.capabilities.accounts.emit('isolated')

  const connect = (value: string) => ({
    send: mock(),
    sendAsync: mock((_payload, callback) => callback(null, { id: 1, jsonrpc: '2.0', result: value })),
    getL1GasCost: async () => 1n,
    on: mock(),
    off: mock()
  })
  const disconnectFirst = first.capabilities.accountCapabilities.chainRpc.connect(connect('first'))
  const disconnectSecond = second.capabilities.accountCapabilities.chainRpc.connect(connect('second'))
  const readChain = (port: typeof first.capabilities.accountCapabilities.chainRpc.port) =>
    new Promise((resolve, reject) =>
      port.sendAsync(
        { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'isolation.test' },
        (error, response) => (error ? reject(error) : resolve(response?.result))
      )
    )

  expect({
    firstAccount: first.capabilities.accounts.get(address)?.name,
    secondAccountMissing: second.capabilities.accounts.get(address) === undefined,
    autohide: [first.store.getState().main.autohide, second.store.getState().main.autohide],
    events,
    rpc: await Promise.all([
      readChain(first.capabilities.accountCapabilities.chainRpc.port),
      readChain(second.capabilities.accountCapabilities.chainRpc.port)
    ]),
    distinct: first.capabilities.accounts !== second.capabilities.accounts
  }).toEqual({
    firstAccount: 'First graph',
    secondAccountMissing: true,
    autohide: [true, false],
    events: [1, 1],
    rpc: ['first', 'second'],
    distinct: true
  })

  disconnectFirst()
  disconnectSecond()
  for (const current of [first, second]) {
    current.capabilities.accounts.dispose()
    current.capabilities.chains.dispose()
    current.capabilities.flashService.dispose()
    current.capabilities.infrastructureCallbacks.dispose()
  }
})

it('releases registered handlers, account listeners, and Flash polling on disposal', () => {
  const { store, capabilities } = graph()
  const ipc = { handle: mock(), removeHandler: mock() }
  const persistence = {
    started: false,
    start: mock(async () => undefined),
    flush: mock(),
    dispose: mock()
  }
  const app = createProductionMainApp({ ...capabilities, ipc, persistence, store })
  const originalClearInterval = globalThis.clearInterval
  const clearIntervalSpy = mock((timer: ReturnType<typeof setInterval>) => originalClearInterval(timer))
  globalThis.clearInterval = clearIntervalSpy as unknown as typeof clearInterval

  try {
    app.start()
    const registered = ipc.handle.mock.calls.map(([channel]) => channel)
    app.start()
    capabilities.accounts.on('direct-consumer', () => undefined)
    const asset = {
      id: '1:0x3333333333333333333333333333333333333333',
      address: '0x3333333333333333333333333333333333333333',
      chainId: 1,
      decimals: 18,
      isNative: false,
      name: 'Token',
      symbol: 'TOK'
    }
    store.setState((state) => {
      state.main.orders['open-order'] = {
        orderId: 'open-order',
        accountAddress: '0x1111111111111111111111111111111111111111',
        provider: 'flash',
        source: 'flash',
        environment: 'test',
        profile: null,
        status: 'accepted',
        rawStatus: 'ORDER_STATUS_ACCEPTED',
        orderType: 'limit',
        side: 'sell',
        targetAsset: asset,
        contraAsset: asset,
        qty: '1',
        spentAsset: asset,
        spentAmount: '1',
        outputAmount: '1',
        estimatedOutputAmount: '1',
        createdAt: 1,
        updatedAt: 1,
        open: true,
        cancellable: true,
        receiveAsset: asset
      }
    })
    capabilities.flashService.startOpenOrderPolling()

    app.dispose()
    app.dispose()

    expect({
      started: app.started,
      registeredTwice: ipc.handle.mock.calls.length !== registered.length,
      removed: ipc.removeHandler.mock.calls.map(([channel]) => channel).sort(),
      registered: registered.sort(),
      accountListeners: capabilities.accounts.listenerCount('direct-consumer'),
      pollingTimersCleared: clearIntervalSpy.mock.calls.length
    }).toEqual({
      started: false,
      registeredTwice: false,
      removed: registered,
      registered,
      accountListeners: 0,
      pollingTimersCleared: 1
    })
  } finally {
    globalThis.clearInterval = originalClearInterval
  }
})
