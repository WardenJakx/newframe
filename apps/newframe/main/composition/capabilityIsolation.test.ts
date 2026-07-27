import { expect, it, mock } from 'bun:test'
import { shell } from 'electron'
import { v5 as uuidv5 } from 'uuid'

import type { FlashQuoteRequest } from '../../contracts/operations'
import type { TransactionRequest } from '../../contracts/requests'
import { erc20Interface } from '../../domain/evm'
import { GasFeesSource, type TransactionData } from '../../domain/transaction'
import { checkExistingNonceGas } from '../provider/helpers'
import createCanonicalStore from '../store/createCanonicalStore'
import { createProductionWalletWorkflowAdapters } from '../infrastructure/walletWorkflows/production'
import {
  createProductionCapabilities,
  createProductionMainApp,
  type ProductionCapabilityAdapters,
  type ProductionWalletWorkflowAdapters
} from './production'

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

function createWalletAdapters(
  overrides: Partial<ProductionWalletWorkflowAdapters> = {}
): ProductionWalletWorkflowAdapters {
  return {
    app: {
      exit: mock(),
      quit: mock(),
      relaunch: mock()
    },
    biometrics: {
      summary: () => ({
        enabled: false,
        method: 'none',
        credential: undefined,
        nativeAvailable: false
      }),
      disable: mock(),
      enableNative: mock(),
      enableWebAuthn: mock()
    } as never,
    clipboard: { writeText: mock() },
    delay: async () => undefined,
    getTokenDiscoveryProvider: mock(() => undefined) as never,
    inspectEnabled: false,
    log: { warn: mock() },
    now: () => 42,
    openBlockExplorer: mock(),
    openExternal: mock(),
    openFileDialog: mock(async () => undefined),
    persistence: { clear: mock() },
    randomBytes: () => Buffer.alloc(32),
    readFile: mock(async () => ''),
    rpcMatchesChain: mock(async () => true),
    signers: {} as never,
    trezorBridge: {
      pinEntered: mock(),
      passphraseEntered: mock(),
      enterPassphraseOnDevice: mock()
    },
    updater: {
      dismissUpdate: mock(),
      fetchUpdate: mock(),
      quitAndInstall: mock(),
      updateReady: false
    },
    vault: {
      exists: () => false,
      getKey: () => null,
      isUnlocked: () => false
    },
    windows: {
      handleTrayMouseout: mock(),
      refocusSideTray: mock()
    },
    ...overrides
  }
}

function createCapabilityAdapters(
  walletOverrides: Partial<ProductionWalletWorkflowAdapters> = {},
  overrides: Partial<Omit<ProductionCapabilityAdapters, 'walletWorkflows'>> = {}
): ProductionCapabilityAdapters {
  return {
    accounts: {
      navigation: {
        back: mock(),
        forward: mock()
      },
      now: () => 42,
      notify: mock(),
      openBlockExplorer: mock(),
      persistence: { flush: mock() },
      schedule: mock(() => ({}) as ReturnType<typeof setTimeout>),
      signers: { get: mock(() => ({}) as never) },
      windows: { showTray: mock() }
    },
    images: {
      downloadImage: mock(async (sourceUrl: string) => ({
        base64: Buffer.from(sourceUrl).toString('base64'),
        contentHash: `hash:${sourceUrl}`,
        mimeType: 'image/png',
        sourceUrl
      })),
      getTokenDiscoveryProvider: mock(() => ({ ok: false, reason: 'disabled' })) as never,
      log: { warn: mock() }
    },
    sideTrayWindows: {
      close: mock(),
      inspect: mock()
    },
    walletWorkflows: createWalletAdapters(walletOverrides),
    ...overrides
  }
}

function createStartedProductionGraph() {
  const store = createCanonicalStore(memoryStorage).store
  const capabilities = createProductionCapabilities(store, createCapabilityAdapters())
  const app = createProductionMainApp({
    ...capabilities,
    ipc: { handle: mock(), removeHandler: mock() },
    persistence: {
      started: false,
      start: mock(async () => undefined),
      flush: mock(),
      dispose: mock()
    },
    store
  })
  app.start()
  return { app, capabilities, store }
}

it('keeps real production simulation metadata projections isolated by graph', async () => {
  const first = createStartedProductionGraph()
  const second = createStartedProductionGraph()
  const account = '0x1111111111111111111111111111111111111111'
  const recipient = '0x2222222222222222222222222222222222222222'
  const token = '0x3333333333333333333333333333333333333333'
  const seedToken = (graph: typeof first, metadata: { decimals: number; name: string; symbol: string }) => {
    graph.store
      .getState()
      .upsertTokens([{ address: token, chainId: 1, ...metadata }], { source: 'transaction', account })
  }
  seedToken(first, { decimals: 6, name: 'Graph A token', symbol: 'GRA' })
  seedToken(second, { decimals: 8, name: 'Graph B token', symbol: 'GRB' })

  const trace = {
    from: account,
    to: recipient,
    value: '0x0',
    input: '0x',
    calls: [
      {
        from: recipient,
        to: token,
        value: '0x0',
        input: erc20Interface.encodeFunctionData('transferFrom', [account, recipient, '25000000'])
      }
    ]
  }
  const respondWithTrace = (_payload: unknown, respond: (response: unknown) => void) =>
    respond({ id: 1, jsonrpc: '2.0', result: trace })
  first.capabilities.provider.send = mock(respondWithTrace) as never
  second.capabilities.provider.send = mock(respondWithTrace) as never
  const request = {
    handlerId: 'simulation-isolation',
    type: 'transaction',
    account,
    recognizedActions: [],
    data: { chainId: '0x1', from: account, to: recipient, value: '0x0', data: '0x' }
  } as unknown as TransactionRequest

  const [firstResult, secondResult] = await Promise.all([
    first.capabilities.accountCapabilities.simulation.port.simulateTransactionEffects(request),
    second.capabilities.accountCapabilities.simulation.port.simulateTransactionEffects(request)
  ])

  expect([firstResult.effects?.[0], secondResult.effects?.[0]]).toEqual([
    expect.objectContaining({ symbol: 'GRA', decimals: 6 }),
    expect.objectContaining({ symbol: 'GRB', decimals: 8 })
  ])
  first.app.dispose()
  second.app.dispose()
})

it('owns Accounts subscriptions and Flash polling timers for direct graph consumers', () => {
  const graph = createStartedProductionGraph()
  const originalClearInterval = globalThis.clearInterval
  const clearIntervalSpy = mock((timer: ReturnType<typeof setInterval>) => originalClearInterval(timer))
  globalThis.clearInterval = clearIntervalSpy as unknown as typeof clearInterval

  try {
    graph.capabilities.accounts.on('direct-consumer', () => undefined)
    const asset = {
      id: '1:0x3333333333333333333333333333333333333333',
      address: '0x3333333333333333333333333333333333333333',
      chainId: 1,
      decimals: 18,
      isNative: false,
      name: 'Token',
      symbol: 'TOK'
    }
    graph.store.getState().upsertOrder({
      orderId: 'open-order',
      accountAddress: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      provider: 'flash',
      source: 'flash',
      environment: 'development',
      profile: 'dev',
      status: 'accepted',
      rawStatus: 'ORDER_STATUS_ACCEPTED',
      orderType: 'market',
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
    })
    graph.capabilities.flashService.startOpenOrderPolling()

    graph.app.dispose()
    graph.app.dispose()

    expect(graph.capabilities.accounts.listenerCount('direct-consumer')).toBe(0)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  } finally {
    globalThis.clearInterval = originalClearInterval
  }
})

it('keeps account state and account/chain listeners isolated across fresh capability graphs', () => {
  const firstStore = createCanonicalStore(memoryStorage).store
  const secondStore = createCanonicalStore(memoryStorage).store
  const first = createProductionCapabilities(firstStore, createCapabilityAdapters())
  const second = createProductionCapabilities(secondStore, createCapabilityAdapters())
  const firstAccounts = first.accounts
  const secondAccounts = second.accounts
  const firstChains = first.chains
  const secondChains = second.chains
  const address = '0x1111111111111111111111111111111111111111'

  firstStore.getState().upsertAccount({
    id: address,
    address,
    name: 'First graph',
    lastSignerType: 'Address',
    signer: '',
    signerStatus: '',
    agentEnabled: false
  })

  let firstEvents = 0
  let secondEvents = 0
  firstAccounts.on('isolated', () => firstEvents++)
  secondAccounts.on('isolated', () => secondEvents++)
  firstChains.on('isolated', () => firstEvents++)
  secondChains.on('isolated', () => secondEvents++)

  firstAccounts.emit('isolated')
  firstChains.emit('isolated')
  firstAccounts.dispose()
  firstChains.dispose()
  firstAccounts.emit('isolated')
  firstChains.emit('isolated')
  secondAccounts.emit('isolated')
  secondChains.emit('isolated')

  expect({
    firstAccount: firstAccounts.get(address),
    firstEvents,
    secondAccount: secondAccounts.get(address),
    secondEvents,
    distinct: {
      accounts: firstAccounts !== secondAccounts,
      chains: firstChains !== secondChains,
      providers: first.provider !== second.provider,
      proxies: first.proxy !== second.proxy
    }
  } as unknown).toStrictEqual({
    firstAccount: expect.objectContaining({ id: address, name: 'First graph' }),
    firstEvents: 2,
    secondAccount: undefined,
    secondEvents: 2,
    distinct: { accounts: true, chains: true, providers: true, proxies: true }
  })
})

it('keeps concrete wallet workflow adapters and dispatcher operations graph-local', async () => {
  const createExternal = (label: string) => ({
    app: { exit: mock(), quit: mock(), relaunch: mock() },
    biometrics: createWalletAdapters().biometrics,
    clipboard: { writeText: mock() },
    persistence: { clear: mock() },
    signers: {
      get: mock((id: string) => (id === `${label}-signer` ? { id } : undefined)),
      reload: mock()
    },
    trezorBridge: createWalletAdapters().trezorBridge,
    updater: {
      dismissUpdate: mock(),
      fetchUpdate: mock(),
      quitAndInstall: mock(),
      updateReady: true
    },
    vault: createWalletAdapters().vault,
    windows: { handleTrayMouseout: mock(), refocusSideTray: mock() }
  })
  const firstStore = createCanonicalStore(memoryStorage).store
  const secondStore = createCanonicalStore(memoryStorage).store
  firstStore.setState((state) => {
    state.main.networks.ethereum[1].explorer = 'https://graph-a.example'
    state.main.autoDiscoverTokens = false
  })
  secondStore.setState((state) => {
    state.main.networks.ethereum[1].explorer = 'https://graph-b.example'
    state.main.autoDiscoverTokens = true
    state.main.portfolioApiKey = ''
  })
  const firstExternal = createExternal('graph-a')
  const secondExternal = createExternal('graph-b')
  const firstAdapters = createProductionWalletWorkflowAdapters(firstStore, firstExternal as never)
  const secondAdapters = createProductionWalletWorkflowAdapters(secondStore, secondExternal as never)
  const first = createProductionCapabilities(firstStore, createCapabilityAdapters(firstAdapters))
  const second = createProductionCapabilities(secondStore, createCapabilityAdapters(secondAdapters))
  const openExternal = shell.openExternal as ReturnType<typeof mock>
  openExternal.mockClear()

  first.walletWorkflows.reloadSigner('graph-a-signer')
  second.walletWorkflows.reloadSigner('graph-b-signer')
  first.walletWorkflows.openTransactionExplorer(1, '0xaaa')
  second.walletWorkflows.openTransactionExplorer(1, '0xbbb')
  first.walletWorkflows.resetWallet('all-settings-data')
  second.walletWorkflows.handleTrayMouseout()

  expect({
    discovery: [firstAdapters.getTokenDiscoveryProvider(), secondAdapters.getTokenDiscoveryProvider()],
    signerReloads: [firstExternal.signers.reload.mock.calls, secondExternal.signers.reload.mock.calls],
    explorer: openExternal.mock.calls,
    updater: firstExternal.updater.quitAndInstall.mock.calls,
    windows: secondExternal.windows.handleTrayMouseout.mock.calls,
    persistence: [firstExternal.persistence.clear.mock.calls, secondExternal.persistence.clear.mock.calls],
    relaunch: [firstExternal.app.relaunch.mock.calls, secondExternal.app.relaunch.mock.calls]
  }).toEqual({
    discovery: [
      { ok: false, error: 'token_discovery_disabled' },
      { ok: false, error: 'missing_api_key' }
    ],
    signerReloads: [[['graph-a-signer']], [['graph-b-signer']]],
    explorer: [['https://graph-a.example/tx/0xaaa'], ['https://graph-b.example/tx/0xbbb']],
    updater: [[]],
    windows: [[]],
    persistence: [[[]], []],
    relaunch: [[], []]
  })
})

it('keeps chain RPC, policy, and simulation routing local to two concurrently started graphs', async () => {
  const createGraph = (label: string) => {
    const store = createCanonicalStore(memoryStorage).store
    store.setState((state) => {
      Object.values(state.main.networks.ethereum).forEach((network) => {
        network.on = false
      })
    })
    const clipboard = { writeText: mock((_text: string) => undefined) }
    const enableNative = mock(async (_key: string) => undefined)
    const downloadImage = mock(async (sourceUrl: string) => ({
      base64: Buffer.from(`${label}:${sourceUrl}`).toString('base64'),
      contentHash: `${label}:${sourceUrl}`,
      mimeType: 'image/png' as const,
      sourceUrl
    }))
    const closeSideTray = mock()
    const inspectSideTray = mock()
    const persistenceFlush = mock()
    const signer = { id: `${label}-signer`, graph: label }
    const signerGet = mock((_id: string) => signer as never)
    const capabilities = createProductionCapabilities(
      store,
      createCapabilityAdapters(
        {
          biometrics: {
            summary: () => ({
              enabled: true,
              method: 'native',
              credential: undefined,
              nativeAvailable: true
            }),
            disable: mock(),
            enableNative,
            enableWebAuthn: mock()
          },
          clipboard,
          vault: {
            exists: () => true,
            getKey: () => `${label}-vault-key`,
            isUnlocked: () => true
          }
        },
        {
          accounts: {
            navigation: {
              back: mock(),
              forward: mock()
            },
            now: () => 42,
            notify: mock(),
            openBlockExplorer: mock(),
            persistence: { flush: persistenceFlush },
            schedule: mock((callback: () => void) => {
              callback()
              return {} as ReturnType<typeof setTimeout>
            }),
            signers: { get: signerGet },
            windows: { showTray: mock() }
          },
          images: {
            downloadImage,
            getTokenDiscoveryProvider: mock(() => ({ ok: false, reason: 'disabled' })) as never,
            log: { warn: mock() }
          },
          sideTrayWindows: {
            close: closeSideTray,
            inspect: inspectSideTray
          }
        }
      )
    )
    const ipc = { handle: mock(), removeHandler: mock() }
    const persistence = {
      started: false,
      start: mock(async () => undefined),
      flush: mock(),
      dispose: mock()
    }
    const app = createProductionMainApp({
      ...capabilities,
      ipc,
      persistence,
      store
    })
    return {
      app,
      capabilities,
      clipboard,
      closeSideTray,
      downloadImage,
      enableNative,
      inspectSideTray,
      persistenceFlush,
      signer,
      signerGet,
      store
    }
  }
  const first = createGraph('graph-a')
  const second = createGraph('graph-b')

  first.app.start()
  second.app.start()

  const firstRpc = mock((_payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) =>
    callback(null, { id: 1, jsonrpc: '2.0', result: 'graph-a' })
  )
  const secondRpc = mock((_payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) =>
    callback(null, { id: 1, jsonrpc: '2.0', result: 'graph-b' })
  )
  const disconnectFirst = [
    first.capabilities.accountCapabilities.chainRpc.connect({
      send: mock(),
      sendAsync: firstRpc,
      getL1GasCost: async () => 1n,
      on: mock(),
      off: mock()
    }),
    first.capabilities.accountCapabilities.transactionPolicy.connect({
      maxFee: () => 111,
      signerCompatibility: () => ({ signer: 'a', tx: 'a', compatible: true })
    }),
    first.capabilities.accountCapabilities.simulation.connect({
      simulateTransactionEffects: async () => ({ status: 'success', effects: [], source: 'graph-a' })
    } as never)
  ]
  const disconnectSecond = [
    second.capabilities.accountCapabilities.chainRpc.connect({
      send: mock(),
      sendAsync: secondRpc,
      getL1GasCost: async () => 2n,
      on: mock(),
      off: mock()
    }),
    second.capabilities.accountCapabilities.transactionPolicy.connect({
      maxFee: () => 222,
      signerCompatibility: () => ({ signer: 'b', tx: 'b', compatible: false })
    }),
    second.capabilities.accountCapabilities.simulation.connect({
      simulateTransactionEffects: async () => ({ status: 'success', effects: [], source: 'graph-b' })
    } as never)
  ]
  const rpcResult = (port: typeof first.capabilities.accountCapabilities.chainRpc.port) =>
    new Promise<unknown>((resolve, reject) => {
      port.sendAsync(
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          _origin: 'capability-isolation.test'
        },
        (error, response) => (error ? reject(error) : resolve(response?.result))
      )
    })
  const transaction = {} as never
  const signer = {} as never
  const request = {} as never

  first.capabilities.walletWorkflows.updateSettings({
    type: 'settings.update',
    setting: 'autohide',
    value: true
  })
  second.capabilities.walletWorkflows.updateSettings({
    type: 'settings.update',
    setting: 'reveal',
    value: true
  })
  await first.capabilities.walletWorkflows.configureSecurity({
    type: 'security.configure',
    mode: 'native'
  })
  await second.capabilities.walletWorkflows.configureSecurity({
    type: 'security.configure',
    mode: 'native'
  })
  first.capabilities.walletWorkflows.writeClipboard('graph-a')
  second.capabilities.walletWorkflows.writeClipboard('graph-b')

  await new Promise((resolve) => setImmediate(resolve))
  first.downloadImage.mockClear()
  second.downloadImage.mockClear()
  const firstToken = {
    address: '0x3333333333333333333333333333333333333333',
    chainId: 1,
    decimals: 18,
    logoURI: 'https://graph-a.example/token.png',
    name: 'Graph A',
    symbol: 'A'
  }
  const secondToken = {
    ...firstToken,
    address: '0x4444444444444444444444444444444444444444',
    logoURI: 'https://graph-b.example/token.png',
    name: 'Graph B',
    symbol: 'B'
  }
  first.store.getState().upsertTokens([firstToken], { source: 'custom' })
  second.store.getState().upsertTokens([secondToken], { source: 'custom' })
  first.capabilities.imageService.requestTokenImage(`1:${firstToken.address}`)
  second.capabilities.imageService.requestTokenImage(`1:${secondToken.address}`)
  await new Promise((resolve) => setImmediate(resolve))

  const sideTrayEvent = { sender: { id: 91 } } as never
  first.capabilities.sideTrayWorkflows.closeOwnSideTray(sideTrayEvent)
  second.capabilities.sideTrayWorkflows.inspectOwnSideTray(sideTrayEvent, 12, 34)

  process.env.NODE_ENV = 'test'
  process.env.BUNDLE_LOCATION = '/app/bundle'
  const renderer = (id: number) => {
    const frame = {
      parent: null,
      url: new URL('file:///app/bundle/tray.html').toString()
    }
    const webContents = {
      id,
      isDestroyed: () => false,
      mainFrame: frame,
      once: mock()
    }
    return { event: { sender: webContents, senderFrame: frame } as never, webContents }
  }
  const firstRenderer = renderer(77)
  const secondRenderer = renderer(77)
  first.capabilities.rendererAuthorization.registerRenderer(
    firstRenderer.webContents as never,
    'wallet-ui',
    'tray'
  )
  second.capabilities.rendererAuthorization.registerRenderer(
    secondRenderer.webContents as never,
    'wallet-ui',
    'tray'
  )

  const firstAddress = '0x1111111111111111111111111111111111111111'
  const secondAddress = '0x2222222222222222222222222222222222222222'
  const selectAccount = (graph: typeof first, address: string, networkEnabled: boolean) => {
    graph.store.getState().upsertAccount({
      id: address,
      address,
      name: address,
      created: '12819530:1626189153547',
      lastSignerType: 'Address',
      signer: '',
      signerStatus: '',
      agentEnabled: false
    })
    graph.store.getState().setAccount({ id: address })
    graph.store.setState((state) => {
      state.main.networks.ethereum[1].on = networkEnabled
    })
  }
  selectAccount(first, firstAddress, true)
  selectAccount(second, secondAddress, false)
  first.store.getState().newSigner({
    id: first.signer.id,
    name: 'Graph A signer',
    model: 'test',
    type: 'ring',
    addresses: [firstAddress],
    status: 'disconnected',
    appVersion: { major: 0, minor: 0, patch: 0 }
  })
  second.store.getState().newSigner({
    id: second.signer.id,
    name: 'Graph B signer',
    model: 'test',
    type: 'ring',
    addresses: [secondAddress],
    status: 'disconnected',
    appVersion: { major: 0, minor: 0, patch: 0 }
  })
  first.capabilities.accounts.rename(firstAddress, 'Renamed graph A')
  second.capabilities.accounts.rename(secondAddress, 'Renamed graph B')
  const firstSelectedSigner = first.capabilities.accounts.current()?.getSigner()
  const secondSelectedSigner = second.capabilities.accounts.current()?.getSigner()
  const permissionOrigin = 'https://graph-a.example'
  first.store.getState().setPermission(firstAddress, {
    handlerId: 'graph-a-permission',
    origin: permissionOrigin,
    provider: true
  })
  const providerSubscription = {
    id: 'graph-subscription',
    originId: uuidv5(permissionOrigin, uuidv5.DNS),
    capabilities: []
  }
  first.capabilities.provider.subscriptions.assetsChanged = [providerSubscription]
  second.capabilities.provider.subscriptions.assetsChanged = [providerSubscription]
  const firstSubscriptionEvents: unknown[] = []
  const secondSubscriptionEvents: unknown[] = []
  first.capabilities.provider.on('data:subscription', (event) => firstSubscriptionEvents.push(event))
  second.capabilities.provider.on('data:subscription', (event) => secondSubscriptionEvents.push(event))
  const assets = { account: firstAddress, nativeCurrency: [], erc20: [] }
  first.capabilities.provider.assetsChanged(firstAddress, assets)
  second.capabilities.provider.assetsChanged(firstAddress, assets)

  first.store.setState((state) => {
    state.main.accounts[firstAddress].requests = {
      existing: {
        handlerId: 'existing',
        type: 'transaction',
        mode: 'monitor',
        status: 'verifying',
        data: { nonce: '0x1', gasPrice: '0x64' }
      } as never
    }
  })
  const nonceCandidate = {
    chainId: '0x1',
    from: firstAddress,
    nonce: '0x1',
    gasPrice: '0x50',
    gasFeesSource: GasFeesSource.Dapp
  } as unknown as TransactionData
  const firstNonceResult = checkExistingNonceGas({ ...nonceCandidate }, first.store)
  const secondNonceResult = checkExistingNonceGas({ ...nonceCandidate }, second.store)
  type RoutedFlashQuoteRequest = FlashQuoteRequest & {
    accountAddress: string
    contraChain: number
    targetChain: number
  }
  const firstFlashQuote = mock(async (_request: RoutedFlashQuoteRequest) => ({
    quote: { id: 'graph-a-quote' },
    flash: { graph: 'a' }
  }))
  const secondFlashQuote = mock(async (_request: RoutedFlashQuoteRequest) => ({
    quote: { id: 'graph-b-quote' },
    flash: { graph: 'b' }
  }))
  first.capabilities.flashService.quote = firstFlashQuote as never
  second.capabilities.flashService.quote = secondFlashQuote as never
  const flashRequest = {
    chainId: 1,
    targetAsset: { chainId: 1 },
    contraAsset: { chainId: 1 },
    inputAmount: '1',
    orderType: 'market',
    qty: '1',
    side: 'sell'
  } as unknown as FlashQuoteRequest

  expect({
    chainRpc: await Promise.all([
      rpcResult(first.capabilities.accountCapabilities.chainRpc.port),
      rpcResult(second.capabilities.accountCapabilities.chainRpc.port)
    ]),
    policy: [
      first.capabilities.accountCapabilities.transactionPolicy.port.maxFee(transaction),
      second.capabilities.accountCapabilities.transactionPolicy.port.maxFee(transaction)
    ],
    compatibility: [
      first.capabilities.accountCapabilities.transactionPolicy.port.signerCompatibility(transaction, signer),
      second.capabilities.accountCapabilities.transactionPolicy.port.signerCompatibility(transaction, signer)
    ],
    simulation: await Promise.all([
      first.capabilities.accountCapabilities.simulation.port.simulateTransactionEffects(request),
      second.capabilities.accountCapabilities.simulation.port.simulateTransactionEffects(request)
    ]),
    sideTrayFlash: await Promise.all([
      first.capabilities.sideTrayTransactions.quoteFlashForCurrentAccount(flashRequest),
      second.capabilities.sideTrayTransactions.quoteFlashForCurrentAccount(flashRequest)
    ]),
    sideTrayFlashCalls: {
      first: firstFlashQuote.mock.calls,
      second: secondFlashQuote.mock.calls
    },
    graphCapabilities: {
      providerState: {
        firstNonceResult,
        secondNonceResult,
        firstSubscriptionEvents,
        secondSubscriptionEvents
      },
      accountsRuntime: {
        firstName: first.store.getState().main.accounts[firstAddress].name,
        secondName: second.store.getState().main.accounts[secondAddress].name,
        firstFlush: first.persistenceFlush.mock.calls,
        secondFlush: second.persistenceFlush.mock.calls,
        firstSigner: firstSelectedSigner,
        secondSigner: secondSelectedSigner,
        firstSignerCalls: first.signerGet.mock.calls,
        secondSignerCalls: second.signerGet.mock.calls
      },
      authorization: {
        firstOwn: first.capabilities.rendererAuthorization.authorizeRenderer(firstRenderer.event),
        firstRejectsSecond: first.capabilities.rendererAuthorization.authorizeRenderer(secondRenderer.event),
        secondOwn: second.capabilities.rendererAuthorization.authorizeRenderer(secondRenderer.event),
        secondRejectsFirst: second.capabilities.rendererAuthorization.authorizeRenderer(firstRenderer.event)
      },
      images: {
        first: first.downloadImage.mock.calls,
        second: second.downloadImage.mock.calls
      },
      windows: {
        firstClose: first.closeSideTray.mock.calls,
        firstInspect: first.inspectSideTray.mock.calls,
        secondClose: second.closeSideTray.mock.calls,
        secondInspect: second.inspectSideTray.mock.calls
      }
    },
    walletWorkflows: {
      firstState: {
        autohide: first.store.getState().main.autohide,
        reveal: first.store.getState().main.reveal
      },
      secondState: {
        autohide: second.store.getState().main.autohide,
        reveal: second.store.getState().main.reveal
      },
      firstSecurity: first.enableNative.mock.calls,
      secondSecurity: second.enableNative.mock.calls,
      firstClipboard: first.clipboard.writeText.mock.calls,
      secondClipboard: second.clipboard.writeText.mock.calls
    }
  }).toEqual({
    chainRpc: ['graph-a', 'graph-b'],
    policy: [111, 222],
    compatibility: [
      { signer: 'a', tx: 'a', compatible: true },
      { signer: 'b', tx: 'b', compatible: false }
    ],
    simulation: [
      { status: 'success', effects: [], source: 'graph-a' },
      { status: 'success', effects: [], source: 'graph-b' }
    ],
    sideTrayFlash: [
      { ok: true, quote: { id: 'graph-a-quote' }, flash: { graph: 'a' } },
      { ok: false, error: 'quote_failed', message: 'Chain is unavailable.' }
    ],
    sideTrayFlashCalls: {
      first: [
        [
          {
            ...flashRequest,
            accountAddress: firstAddress,
            contraChain: 1,
            targetChain: 1
          }
        ]
      ],
      second: []
    },
    graphCapabilities: {
      providerState: {
        firstNonceResult: expect.objectContaining({
          gasPrice: '0x6f',
          gasFeesSource: GasFeesSource.Frame,
          feesUpdated: true
        }),
        secondNonceResult: expect.objectContaining({
          gasPrice: '0x50',
          gasFeesSource: GasFeesSource.Dapp
        }),
        firstSubscriptionEvents: [
          expect.objectContaining({
            method: 'eth_subscription',
            params: {
              subscription: providerSubscription.id,
              result: assets
            }
          })
        ],
        secondSubscriptionEvents: []
      },
      accountsRuntime: {
        firstName: 'Renamed graph A',
        secondName: 'Renamed graph B',
        firstFlush: [[]],
        secondFlush: [[]],
        firstSigner: expect.objectContaining({ id: first.signer.id }),
        secondSigner: expect.objectContaining({ id: second.signer.id }),
        firstSignerCalls: [[first.signer.id]],
        secondSignerCalls: [[second.signer.id]]
      },
      authorization: {
        firstOwn: {
          clientType: 'wallet-ui',
          entrypoint: 'tray',
          webContentsId: 77,
          windowInstanceId: expect.any(String)
        },
        firstRejectsSecond: undefined,
        secondOwn: {
          clientType: 'wallet-ui',
          entrypoint: 'tray',
          webContentsId: 77,
          windowInstanceId: expect.any(String)
        },
        secondRejectsFirst: undefined
      },
      images: {
        first: [[firstToken.logoURI]],
        second: [[secondToken.logoURI]]
      },
      windows: {
        firstClose: [[sideTrayEvent]],
        firstInspect: [],
        secondClose: [],
        secondInspect: [[sideTrayEvent, 12, 34]]
      }
    },
    walletWorkflows: {
      firstState: { autohide: true, reveal: false },
      secondState: { autohide: false, reveal: true },
      firstSecurity: [['graph-a-vault-key']],
      secondSecurity: [['graph-b-vault-key']],
      firstClipboard: [['graph-a']],
      secondClipboard: [['graph-b']]
    }
  })

  disconnectFirst.reverse().forEach((disconnect) => disconnect())
  disconnectSecond.reverse().forEach((disconnect) => disconnect())
  first.app.dispose()
  second.app.dispose()
})
