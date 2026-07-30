import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createSecurityService } from '../features/security/service'
import { createSettingsService } from '../features/settings/service'
import { createTestStore } from '../../test/support/createTestStore'

let activeStore = createTestStore()

let workflows: typeof import('./walletWorkflows')

beforeAll(async () => {
  workflows = await import('./walletWorkflows')
})

beforeEach(() => {
  activeStore = createTestStore()
})

const address = '0x1111111111111111111111111111111111111111'

function freshStore(main: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  activeStore = createTestStore({
    ...extra,
    main
  })
  return activeStore
}

function accountPort(overrides: Record<string, unknown> = {}) {
  return {
    current: mock(() => undefined),
    ...overrides
  } as never
}

function createOperations(overrides: Partial<import('./walletWorkflows').WalletWorkflowDependencies> = {}) {
  return workflows.createWalletWorkflowOperations({
    accounts: accountPort(),
    assetRateService: { get: mock(), observe: mock() },
    app: { exit: mock(), quit: mock(), relaunch: mock() },
    biometrics: {
      summary: () => ({
        enabled: false,
        method: 'none',
        credential: '',
        nativeAvailable: false
      }),
      disable: mock(),
      enableNative: mock(async () => undefined),
      enableWebAuthn: mock()
    },
    chains: {} as never,
    clipboard: { writeText: mock() },
    delay: async () => undefined,
    flashService: {} as never,
    getTokenDiscoveryProvider: mock(() => ({ ok: false, reason: 'disabled' })) as never,
    inspectEnabled: false,
    log: { warn: mock() },
    nameResolution: {} as never,
    now: () => 1,
    openBlockExplorer: mock(),
    openExternal: mock(),
    openFileDialog: mock(async () => undefined),
    persistence: { clear: mock() },
    provider: {} as never,
    proxy: {} as never,
    randomBytes: () => Buffer.alloc(32),
    readFile: mock(async () => ''),
    reveal: {} as never,
    rpcMatchesChain: mock(async () => true),
    signers: {
      get: mock(),
      remove: mock(),
      reload: mock(),
      createFromKeystore: mock(),
      createFromPhrase: mock(),
      createFromPrivateKey: mock(),
      exportAccountPrivateKey: mock(),
      newPhrase: mock(),
      lockApp: mock((done: (error?: Error) => void) => done()),
      unlockApp: mock(),
      unlockAppWithBiometrics: mock()
    } as never,
    store: activeStore,
    transactionPolicy: {
      maxFee: () => 1e30,
      signerCompatibility: () => ({ signer: '', tx: '', compatible: true })
    },
    trezorBridge: {
      pinEntered: mock(),
      passphraseEntered: mock(),
      enterPassphraseOnDevice: mock()
    },
    updater: {
      updateReady: false,
      dismissUpdate: mock(),
      fetchUpdate: mock(),
      quitAndInstall: mock()
    },
    vault: {
      exists: () => false,
      getKey: () => undefined,
      isUnlocked: () => false
    },
    windows: {
      handleTrayMouseout: mock(),
      refocusSideTray: mock()
    },
    ...overrides
  } as import('./walletWorkflows').WalletWorkflowDependencies)
}

describe('wallet workflows with fresh canonical state', () => {
  it.each(['saved-data', 'all-settings-data'] as const)(
    'clears canonical asset rates for the %s reset path',
    (scope) => {
      freshStore({
        assetRates: {
          token: { usdRate: 2, source: 'zerion', observedAt: 1 }
        },
        tokens: { byId: {}, accountTokenIds: {} },
        balances: {}
      })

      createOperations().resetWallet(scope)
      expect(activeStore.getState().main.assetRates).toEqual({})
    }
  )

  it('forwards the complete Zerion observation batch exactly once through the rate service', async () => {
    const accountId = address
    freshStore({
      currentAccount: accountId,
      accounts: { [accountId]: { id: accountId, address } },
      networks: { ethereum: { 1: { id: 1, on: true } } }
    })
    const assetRates = [
      {
        chainId: 1,
        address: '0x0000000000000000000000000000000000000001',
        usdRate: 2
      }
    ]
    const observe = mock()
    const refreshBalances = mock()
    const operations = createOperations({
      accounts: accountPort({ refreshBalances }),
      assetRateService: { get: mock(), observe },
      getTokenDiscoveryProvider: () => ({
        ok: true,
        provider: {
          getWalletPortfolio: mock(async () => ({
            totalValue: 0,
            absoluteChange1d: 0,
            percentChange1d: 0,
            chainValues: {},
            tokens: [],
            balances: [],
            assetRates
          }))
        }
      })
    } as never)

    await expect(operations.refreshPortfolio()).resolves.toBe(true)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith('zerion', assetRates)
    expect(refreshBalances).toHaveBeenCalledWith(address)
  })

  it('checks address nonces only on enabled chains and reports partial provider failure', async () => {
    const secondAddress = '0x3333333333333333333333333333333333333333'
    freshStore({
      networks: {
        ethereum: {
          1: { id: 1, on: true },
          10: { id: 10, on: true },
          137: { id: 137, on: false }
        }
      }
    })
    const send = mock((payload: RPCRequestPayload, respond: RPCRequestCallback, chain: { id: number }) => {
      const requestedAddress = payload.params?.[0]
      if (chain.id === 10 && requestedAddress === secondAddress) {
        return respond({ id: payload.id, jsonrpc: '2.0', result: '0x2' })
      }
      if (chain.id === 1 && requestedAddress === secondAddress) {
        return respond({ id: payload.id, jsonrpc: '2.0', error: { message: 'offline' } })
      }
      return respond({ id: payload.id, jsonrpc: '2.0', result: '0x0' })
    })

    const operations = createOperations({ chains: { send } as never })

    await expect(operations.getAddressChainUsage([address, secondAddress])).resolves.toEqual([
      { address, chainIds: [], complete: true },
      { address: secondAddress, chainIds: [10], complete: false }
    ])
    expect(
      send.mock.calls.map(([payload, , chain]) => ({
        address: payload.params?.[0],
        block: payload.params?.[1],
        chainId: chain.id,
        method: payload.method
      }))
    ).toEqual([
      { address, block: 'latest', chainId: 1, method: 'eth_getTransactionCount' },
      { address, block: 'latest', chainId: 10, method: 'eth_getTransactionCount' },
      { address: secondAddress, block: 'latest', chainId: 1, method: 'eth_getTransactionCount' },
      { address: secondAddress, block: 'latest', chainId: 10, method: 'eth_getTransactionCount' }
    ])
  })

  it('applies token removal and Home command consumption through real canonical actions', () => {
    const token = {
      address,
      chainId: 1,
      decimals: 18,
      logoURI: '',
      name: 'Token',
      symbol: 'TKN',
      custom: true,
      curated: false,
      sources: ['custom'] as Array<'custom'>,
      updatedAt: 0
    }
    const tokenId = `1:${address}`
    freshStore(
      {
        networks: { ethereum: {} },
        tokens: { accountTokenIds: {}, byId: { [tokenId]: token } }
      },
      { tray: { homeCommand: { id: 7, type: 'view', data: {} } } }
    )

    const operations = createOperations()
    expect(operations.removeToken({ address: address.toUpperCase(), chainId: 1 })).toBe(true)
    expect(operations.consumeHomeCommand(6)).toBe(false)
    expect(operations.consumeHomeCommand(7)).toBe(true)
    expect({
      token: activeStore.getState().main.tokens.byId[tokenId],
      homeCommand: activeStore.getState().tray.homeCommand
    }).toEqual({
      token: { ...token, custom: false },
      homeCommand: null
    })
  })

  it('verifies an RPC before atomically changing the canonical primary connection', async () => {
    freshStore({
      networks: {
        ethereum: {
          1: {
            id: 1,
            type: 'ethereum',
            connection: {
              primary: {
                connected: false,
                current: 'local',
                custom: '',
                network: '',
                on: false,
                status: 'off',
                type: ''
              },
              secondary: {
                connected: false,
                current: 'local',
                custom: '',
                network: '',
                on: false,
                status: 'off',
                type: ''
              }
            }
          }
        }
      }
    })
    const operations = createOperations({ rpcMatchesChain: mock(async () => true) })
    await expect(operations.setNetworkPrimaryRpc(1, 'https://rpc.example')).resolves.toBe(true)
    expect(activeStore.getState().main.networks.ethereum[1].connection).toEqual({
      primary: {
        connected: false,
        current: 'custom',
        custom: 'https://rpc.example',
        network: '',
        on: true,
        status: 'off',
        type: ''
      },
      secondary: {
        connected: false,
        current: 'local',
        custom: '',
        network: '',
        on: false,
        status: 'off',
        type: ''
      }
    })
    await expect(operations.setNetworkPrimaryRpc(10, 'https://attacker.example')).resolves.toBe(false)
  })

  it('validates and resolves a canonical add-chain request into complete network state', async () => {
    const chain = {
      id: 10,
      name: 'Optimism',
      type: 'ethereum',
      primaryRpc: 'https://rpc.example.com',
      explorer: 'https://explorer.example.com',
      symbol: 'ETH',
      primaryColor: 'accent2'
    }
    const request = { handlerId: 'request-1', type: 'addChain', chain }
    const resolveRequest = mock()
    const accounts = accountPort({
      current: () => ({ getRequest: (id: string) => (id === request.handlerId ? request : undefined) }),
      resolveRequest
    })
    freshStore({
      networks: { ethereum: {} },
      networksMeta: { ethereum: {} }
    })
    const operations = createOperations({
      accounts,
      rpcMatchesChain: mock(async () => true)
    })
    await expect(
      operations.resolveNetworkRequest({
        type: 'network.request-resolve',
        requestId: request.handlerId,
        approved: true
      })
    ).resolves.toBe(true)

    expect({
      network: activeStore.getState().main.networks.ethereum[10],
      metadata: activeStore.getState().main.networksMeta.ethereum[10],
      resolved: resolveRequest.mock.calls
    }).toEqual({
      network: expect.objectContaining({
        id: 10,
        name: 'Optimism',
        on: true,
        symbol: 'ETH',
        type: 'ethereum'
      }),
      metadata: expect.objectContaining({
        name: 'Optimism',
        primaryColor: 'accent2',
        nativeCurrency: expect.objectContaining({ symbol: 'ETH' })
      }),
      resolved: [[request]]
    })
  })

  it('refuses add-chain approval when the external RPC identifies another chain', async () => {
    const chain = {
      id: 10,
      name: 'Optimism',
      type: 'ethereum',
      primaryRpc: 'https://rpc.example.com'
    }
    const request = { handlerId: 'request-mismatch', type: 'addChain', chain }
    const resolveRequest = mock()
    const accounts = accountPort({
      current: () => ({ getRequest: () => request }),
      resolveRequest
    })
    freshStore({ networks: { ethereum: {} }, networksMeta: { ethereum: {} } })
    const operations = createOperations({
      accounts,
      rpcMatchesChain: mock(async () => false)
    })
    await expect(
      operations.resolveNetworkRequest({
        type: 'network.request-resolve',
        requestId: request.handlerId,
        approved: true
      })
    ).rejects.toThrow('different chain ID')

    expect({
      networks: activeStore.getState().main.networks.ethereum,
      resolved: resolveRequest.mock.calls
    }).toEqual({ networks: {}, resolved: [] })
  })

  it('projects add-chain review navigation as display data plus a canonical request identifier', () => {
    const chain = {
      id: 10,
      name: 'Optimism',
      type: 'ethereum',
      primaryRpc: 'https://rpc.example.com',
      symbol: 'ETH'
    }
    const request = {
      handlerId: 'request-review',
      type: 'addChain',
      chain,
      origin: 'https://sensitive.example',
      authorization: {
        decision: 'autonomous',
        principal: { type: 'agent', sessionId: 'secret-session' }
      }
    }
    const accounts = accountPort({
      current: () => ({ getRequest: (id: string) => (id === request.handlerId ? request : undefined) })
    })
    freshStore({ networks: { ethereum: {} } })
    const operations = createOperations({ accounts })

    expect(operations.reviewAddChainRequest(request.handlerId)).toBe(true)
    expect(activeStore.getState().tray.homeCommand as unknown).toEqual({
      id: expect.any(Number),
      view: 'addChain',
      data: { chain, requestId: request.handlerId }
    })
  })

  it('cancels a Flash order using only canonical account, network, and order state', async () => {
    const orderId = 'order-1'
    freshStore({
      accounts: { [address]: { id: address, address } },
      currentAccount: address,
      networks: { ethereum: { 1: { id: 1, type: 'ethereum' } } },
      orders: { [orderId]: { accountAddress: address, chainId: 1 } },
      origins: {}
    })
    const send = mock((payload: RPCRequestPayload, respond: RPCRequestCallback) =>
      respond({ id: payload.id, jsonrpc: '2.0', result: '0x1234' })
    )
    const cancelOrder = mock(async (_input: { orderId: string; signature: string }) => undefined)
    const operations = createOperations({
      flashService: { cancelOrder } as never,
      provider: { send } as never
    })
    const { createRendererPrincipal } = await import('../authority')
    const principal = createRendererPrincipal({
      clientType: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: 1,
      windowInstanceId: 'tray-test'
    })

    await expect(operations.cancelFlashOrder(orderId, principal)).resolves.toBe(true)
    expect({
      providerRequest: send.mock.calls[0][0],
      cancel: cancelOrder.mock.calls,
      origins: Object.values(activeStore.getState().main.origins)
    }).toEqual({
      providerRequest: expect.objectContaining({
        method: 'personal_sign',
        chainId: '0x1',
        params: [expect.stringContaining(orderId), address]
      }),
      cancel: [[{ orderId, signature: '0x1234' }]],
      origins: [
        expect.objectContaining({
          name: 'newframe-internal',
          chain: { id: 1, type: 'ethereum' }
        })
      ]
    })
  })

  it('owns access, chain-switch, and rejection decisions from canonical account requests', () => {
    const access = { handlerId: 'access-1', type: 'access', origin: 'origin-1', account: address }
    const switchRequest = {
      handlerId: 'switch-1',
      type: 'switchChain',
      origin: 'origin-1',
      account: address,
      chain: { id: '10', type: 'ethereum' }
    }
    const requests = { [access.handlerId]: access, [switchRequest.handlerId]: switchRequest }
    const rejectRequest = mock()
    const resolveRequest = mock()
    const setAccess = mock()
    const accounts = accountPort({
      current: () => ({ address, getRequest: (id: string) => requests[id as keyof typeof requests] }),
      rejectRequest,
      resolveRequest,
      setAccess
    })
    freshStore({
      networks: { ethereum: { 10: { id: 10 } } },
      origins: { 'origin-1': { id: 'origin-1', chain: { id: 1, type: 'ethereum' } } }
    })
    const operations = createOperations({ accounts })

    expect(operations.rejectRequest(access.handlerId)).toBe(true)
    expect(operations.resolveAccessRequest(access.handlerId, true)).toBe(true)
    expect(operations.resolveSwitchChainRequest(switchRequest.handlerId, true)).toBe(true)
    expect({
      rejected: rejectRequest.mock.calls,
      access: setAccess.mock.calls,
      resolved: resolveRequest.mock.calls,
      origin: activeStore.getState().main.origins['origin-1']
    }).toEqual({
      rejected: [[access, { code: 4001, message: 'User rejected the request' }]],
      access: [[access, true]],
      resolved: [[switchRequest]],
      origin: expect.objectContaining({ chain: { id: 10, type: 'ethereum' } })
    })
  })
})

describe('feature services with fresh instances and narrow external ports', () => {
  it('applies security configuration to real canonical state through biometric and vault ports', async () => {
    const store = createTestStore({
      main: {
        appLock: { locked: true, vaultExists: true },
        biometricUnlock: false
      }
    })
    const disable = mock()
    const enableNative = mock(async (_key: string) => undefined)
    const service = createSecurityService({
      biometrics: {
        disable,
        enableNative,
        enableWebAuthn: mock(),
        summary: () => ({ enabled: true, method: 'native', nativeAvailable: true })
      } as never,
      signers: {} as never,
      store,
      vault: { isUnlocked: () => true, getKey: () => 'vault-key' }
    })

    expect(service.status()).toEqual({
      locked: true,
      vaultExists: true,
      biometricUnlockEnabled: true,
      biometricAvailable: true,
      biometrics: {
        enabled: true,
        method: 'native',
        credential: undefined,
        nativeAvailable: true
      }
    })
    await service.configure({ type: 'security.configure', mode: 'native' })
    expect({
      enabled: store.getState().main.biometricUnlock,
      nativeKeys: enableNative.mock.calls,
      disabled: disable.mock.calls
    }).toEqual({
      enabled: true,
      nativeKeys: [['vault-key']],
      disabled: []
    })
  })

  it('owns settings transitions through a fresh service and real canonical actions', () => {
    const store = createTestStore({
      main: {
        autohide: false,
        portfolioApiKey: '',
        autoDiscoverTokens: false
      }
    })
    const service = createSettingsService(store)

    service.update({ type: 'settings.update', setting: 'autohide', value: true })
    service.update({
      type: 'settings.update',
      setting: 'auto-discover-tokens',
      value: true,
      apiKey: ' portfolio-key '
    })

    expect({
      autohide: store.getState().main.autohide,
      autoDiscoverTokens: store.getState().main.autoDiscoverTokens,
      portfolioApiKey: store.getState().main.portfolioApiKey
    }).toEqual({
      autohide: true,
      autoDiscoverTokens: true,
      portfolioApiKey: 'portfolio-key'
    })
  })
})
