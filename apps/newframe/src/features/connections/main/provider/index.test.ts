import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest as timers,
  mock,
  spyOn
} from 'bun:test'
import EventEmitter from 'events'
import { randomUUID } from 'node:crypto'

import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import log from 'electron-log'
import { parseUnits, toBeHex } from 'ethers'
import { validate as validateUUID } from 'uuid'

import type { DecodedCallData } from '../../../../platform/chain-rpc/contracts'
import { Type as SignerType } from '../../../../platform/signing/domain'
import type { SigningApprovalContext, SigningUiContext } from '../../../../platform/signing/signers/Signer'
import type { Chain as StoredChain, Gas, Permission } from '../../../../platform/state-store/state'
import { gweiToHex } from '../../../../shared/domain/hex'
import {
  createAgentPrincipal,
  createRpcPrincipal,
  type AgentPrincipal,
  type TrustedPrincipal
} from '../../../access-control/main/authority'
import { AccountSchema } from '../../../accounts/domain/state/account'
import type { SafeTransactionPort } from '../../../accounts/main/safeTransactionPort'
import type { Origin } from '../../../connections/domain/state/origin'
import type { Chains } from '../../../networks/main'
import chainConfig from '../../../networks/main/config'
import type {
  AccountRequest,
  AddChainRequest,
  SignTypedDataRequest,
  TransactionRequest
} from '../../../requests/contract/requests'
import { TxClassification } from '../../../requests/contract/requests'
import { GasFeesSource, type TransactionData } from '../../../transactions/domain'
import type { AccountRequestPort } from './accountRequestPort'
import type { Provider, TransactionRequestContext } from './index'
import type { ProviderProxyConnection } from './proxy'
import type { Subscription } from './subscriptions'

const address = '0x22dd63c3619818fdbc262c78baee43cb61e9cccf'
const principal = createRpcPrincipal({
  transport: 'http',
  connectionId: 'provider-test',
  origin: 'frame.test'
})
const internalPrincipal = createRpcPrincipal({
  transport: 'websocket',
  connectionId: 'companion-test',
  origin: 'frame.test',
  capabilities: ['wallet:internal-state']
})

interface TestCurrentAccount {
  id: string
  getAccounts?(): string[]
}

interface TestAccount extends TestCurrentAccount {
  address: string
  lastSignerType: string
  safe?: Record<string, unknown>
}

const frameAccountFixture = (overrides: Partial<TestCurrentAccount> = {}): TestCurrentAccount => ({
  id: address,
  getAccounts: () => [address],
  ...overrides
})

const createCurrentMock = () => mock((): TestCurrentAccount | null => null)
const createGetMock = () => mock((_address: string): TestAccount | undefined => undefined)
const createSignTransactionMock = () =>
  mock((_tx: TransactionData, _cb: Callback<string>, _context?: SigningApprovalContext) => {})
const createSetTxSignedMock = () => mock((_handlerId: string, _cb: Callback<void>) => {})
const createSetSignerMock = () => mock((_id: string, _cb: Callback<TestAccount>) => {})
const createGetFrameAccountMock = () => mock((_id: string): TestAgentAccount | undefined => undefined)
const createTrackAutonomousTransactionMock = () =>
  mock((_accountId: string, _request: TransactionRequest, _hash: string) => {})

interface TestAccounts {
  clearRequestsByOrigin: ReturnType<typeof mock>
  current: ReturnType<typeof createCurrentMock>
  get: ReturnType<typeof createGetMock>
  getAccounts(): string[]
  getFrameAccount: ReturnType<typeof createGetFrameAccountMock>
  lockRequest: ReturnType<typeof mock>
  routeRequest(
    principal: TrustedPrincipal,
    request: AccountRequest,
    executeAutonomously?: (request: AccountRequest) => void
  ): boolean
  setSigner: ReturnType<typeof createSetSignerMock>
  setTxSigned: ReturnType<typeof createSetTxSignedMock>
  signTransaction: ReturnType<typeof createSignTransactionMock>
  trackAutonomousTransaction: ReturnType<typeof createTrackAutonomousTransactionMock>
}

const createChainSendMock = () =>
  mock(
    (
      _payload: RPCRequestPayload,
      _res: RPCRequestCallback,
      _targetChain?: { type: 'ethereum'; id: number }
    ) => {}
  )

interface TestChains {
  send: ReturnType<typeof createChainSendMock>
  refreshGasFees: ReturnType<typeof mock>
  connections: Record<
    'ethereum',
    Record<number, { chainConfig: ReturnType<typeof chainConfig>; primary: { connected: boolean } }>
  >
}

type PublicProvider = { [Key in keyof Provider]: Provider[Key] }
interface TestAgentAccount {
  id: string
  signTransaction: ReturnType<typeof createSignTransactionMock>
}
type TestProvider = Omit<PublicProvider, 'connection' | 'subscriptions'> & {
  connection: TestChains
  subscriptions: Record<string, Subscription[]>
  executeAgentTransaction(
    account: TestAgentAccount,
    request: TransactionRequest,
    principal: AgentPrincipal,
    respond: RPCRequestCallback
  ): void
}

let accountRequests: AccountRequest[] = []
let provider: TestProvider
const accounts: TestAccounts = {
  clearRequestsByOrigin: mock(),
  current: createCurrentMock(),
  get: createGetMock(),
  getAccounts: () => [],
  getFrameAccount: createGetFrameAccountMock(),
  lockRequest: mock(),
  routeRequest: () => false,
  setSigner: createSetSignerMock(),
  setTxSigned: createSetTxSignedMock(),
  signTransaction: createSignTransactionMock(),
  trackAutonomousTransaction: createTrackAutonomousTransactionMock()
}
let connection: TestChains
let store: typeof import('../../../../platform/state-store').default
let accountRequestHook:
  | ((request: AccountRequest, respond?: (response: RPCResponsePayload) => void) => void)
  | undefined
const lookupChainIcon = mock(async (_chainId: number) => '')
const safeTxHash = `0x${'a'.repeat(64)}`
const prepareSafeDraft = mock(
  (_input: Parameters<SafeTransactionPort['prepareDraft']>[0]) =>
    ({
      accountId: address,
      chainId: 1,
      proposal: { safeTxHash }
    }) as ReturnType<SafeTransactionPort['prepareDraft']>
)
const attachSafeDraft = mock(
  (_draft: Parameters<SafeTransactionPort['attach']>[0], _requestId: string) => safeTxHash
)
const decodeTransactionCalldata = mock(
  async (_contract: string, _chainId: number, _calldata: string): Promise<DecodedCallData | undefined> =>
    undefined
)
const rpcResult = <T>(response: RPCResponsePayload) => response.result as T
const rpcError = (response: RPCResponsePayload) => response.error as { code: number; message: string }
const responseError = (response: RPCResponsePayload) => {
  if (!response.error) {
    throw new Error('Expected RPC error')
  }
  return response.error
}
const requestContinuations = {
  callbacks: new Map<string, RPCRequestCallback>(),
  bind: mock(),
  create(respond: RPCRequestCallback) {
    const requestId = randomUUID()
    this.callbacks.set(requestId, respond)
    return requestId
  },
  respond(requestId: string, response: RPCResponsePayload) {
    const callback = this.callbacks.get(requestId)
    if (!callback) {
      return false
    }
    this.callbacks.delete(requestId)
    callback(response)
    return true
  }
}

const storeState = () => store.getState()
type OriginInput = Partial<Omit<Origin, 'chain' | 'session'>> & {
  chain: Origin['chain'] & {
    on?: boolean
    connection?: { primary?: Record<string, unknown>; secondary?: Record<string, unknown> }
  }
  session?: Origin['session']
}
const normalizeOrigin = (origin: OriginInput): OriginInput & Origin => ({
  name: origin.name ?? 'test.origin',
  session: origin.session ?? { requests: 0, startedAt: 0, lastUpdatedAt: 0 },
  ...origin
})
const setOrigin = (id: string, origin: OriginInput) => {
  store.setState((state) => {
    state.main.origins[id] = normalizeOrigin(origin)
  })
}
const setOrigins = (origins: Record<string, OriginInput>) => {
  store.setState((state) => {
    state.main.origins = Object.fromEntries(
      Object.entries(origins).map(([id, origin]) => [id, normalizeOrigin(origin)])
    )
  })
}
type PermissionInput = Omit<Permission, 'handlerId'> & { handlerId?: string }
const setPermissions = (account: string, permissions: Record<string, PermissionInput>) => {
  store.setState((state) => {
    state.main.permissions[account] = Object.fromEntries(
      Object.entries(permissions).map(([id, permission]) => [
        id,
        { handlerId: permission.handlerId ?? `test-${id}`, ...permission }
      ])
    )
  })
}
type ConnectionOverride = Partial<StoredChain['connection']['primary']>
interface NetworkOverrides extends Partial<Omit<StoredChain, 'connection'>> {
  connection?: {
    primary?: ConnectionOverride
    secondary?: ConnectionOverride
  }
}
const storedConnection = (override: ConnectionOverride = {}): StoredChain['connection']['primary'] => ({
  on: true,
  connected: false,
  current: 'chainlist',
  status: 'disconnected',
  custom: '',
  ...override
})
const setNetwork = (id: number, network: NetworkOverrides | undefined) => {
  store.setState((state) => {
    if (network === undefined) {
      delete state.main.networks.ethereum[id]
    } else {
      state.main.networks.ethereum[id] = {
        id,
        type: 'ethereum',
        name: `chain-${id}`,
        explorer: '',
        on: true,
        isTestnet: false,
        ...network,
        connection: {
          primary: storedConnection(network.connection?.primary),
          secondary: storedConnection(network.connection?.secondary)
        }
      }
      state.main.networksMeta.ethereum[id] ??= {
        gas: { samples: [], price: { selected: 'fast', levels: {} } },
        primaryColor: 'accent1',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18, icon: '' }
      }
    }
  })
}
const setNetworkGas = (id: number, gas: Gas) => {
  store.setState((state) => {
    state.main.networksMeta.ethereum[id] ??= {
      gas,
      primaryColor: 'accent1',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18, icon: '' }
    }
    state.main.networksMeta.ethereum[id].gas = gas
  })
}
const expectQueuedRequestRejection = (sendRequest: (callback: RPCRequestCallback) => void) =>
  new Promise<void>((resolve, reject) => {
    const callback = mock()
    accountRequestHook = (request, respond) => {
      try {
        expect(typeof respond).toBe('function')
        expect(requestContinuations.callbacks.has(request.handlerId)).toBe(true)
        const rejection = {
          id: request.payload.id,
          jsonrpc: request.payload.jsonrpc,
          error: { code: 4001, message: 'User rejected the request' }
        }
        respond?.(rejection)
        respond?.(rejection)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(rejection)
        expect(requestContinuations.callbacks.has(request.handlerId)).toBe(false)
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    sendRequest(callback)
  })

await mock.module('../../../networks/main', () => {
  const chains = { send: mock(), syncDataEmit: mock(), on: mock(), off: mock(), refreshGasFees: mock() }
  return { default: chains, ...chains }
})
await mock.module('../../../transactions/main/reveal', () => {
  const reveal = {
    resolveEntityType: mock().mockResolvedValue('external')
  }
  return { default: reveal, ...reveal }
})

await mock.module('./subscriptions', () => ({
  SubscriptionType: {
    ACCOUNTS: 'accountsChanged',
    ASSETS: 'assetsChanged',
    CHAINS: 'chainsChanged'
  },
  hasSubscriptionPermission: mock()
}))

beforeAll(async () => {
  log.transports.console.level = false

  const connectionModule = (await import('../../../networks/main')) as unknown as {
    default: TestChains
  }
  connection = connectionModule.default
  store = (await import('../../../../platform/state-store')).default
  accounts.getAccounts = () => [address]
  accounts.current = mock(() => ({ id: address, getAccounts: () => [address] }))
  accounts.get = createGetMock()
  accounts.routeRequest = (receivedPrincipal, req, executeAutonomously) => {
    expect(receivedPrincipal).toBe(principal)
    store.setState((state) => {
      state.main.accounts[req.account] ??= AccountSchema.parse({
        id: req.account,
        profileId: 'test-profile',
        address: req.account,
        name: 'Test account',
        lastSignerType: 'ring',
        status: 'ok',
        signer: 'test-signer',
        requests: {},
        created: new Date(0).toISOString()
      })
      state.main.accounts[req.account].requests = { [req.handlerId]: req }
    })
    accountRequests.push(req)
    if (accountRequestHook) {
      const hook = accountRequestHook
      accountRequestHook = undefined
      hook(req, (response) => requestContinuations.respond(req.handlerId, response))
    } else if (executeAutonomously) {
      executeAutonomously(req)
    } else {
      requestContinuations.respond(req.handlerId, {
        id: req.payload.id,
        jsonrpc: req.payload.jsonrpc,
        result: undefined
      })
    }
    return true
  }

  const { Provider } = await import('./index')
  const { createProviderStatePort } = await import('./statePort')
  provider = new Provider({
    accounts: accounts as unknown as AccountRequestPort,
    chains: connection as unknown as Chains,
    lookupChainIcon,
    proxy: new EventEmitter() as ProviderProxyConnection,
    state: createProviderStatePort(store),
    store,
    reveal: {
      decode: decodeTransactionCalldata,
      resolveEntityType: mock(async () => 'unknown' as const)
    },
    requests: requestContinuations,
    safeTransactions: {
      prepareDraft: prepareSafeDraft,
      attach: attachSafeDraft
    }
  }) as unknown as TestProvider
  provider.start()
})

afterAll(() => {
  provider.dispose()
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  timers.useFakeTimers()

  store.setState((state) => {
    state.main.accounts = {}
    state.main.balances = {}
    state.main.currentAccount = ''
    state.main.networks.ethereum = {}
    state.main.origins = {}
    state.main.assetRates = {}
  })

  requestContinuations.callbacks.clear()

  const eventTypes = [
    'accountsChanged',
    'chainChanged',
    'chainsChanged',
    'assetsChanged',
    'networkChanged'
  ] as const
  eventTypes.forEach((eventType) => (provider.subscriptions[eventType] = []))

  accountRequests = []
  accountRequestHook = undefined
  lookupChainIcon.mockReset()
  lookupChainIcon.mockImplementation(async () => '')
  prepareSafeDraft.mockClear()
  attachSafeDraft.mockClear()
  decodeTransactionCalldata.mockReset()
  decodeTransactionCalldata.mockImplementation(async () => undefined)

  connection.send = createChainSendMock()
  connection.refreshGasFees = mock().mockResolvedValue(undefined)
  connection.connections = {
    ethereum: {
      1: { chainConfig: chainConfig(1, 'london'), primary: { connected: true } },
      5: { chainConfig: chainConfig(5, 'london'), primary: { connected: true } }
    }
  }

  accounts.current = mock((): TestCurrentAccount => ({ id: address, getAccounts: () => [address] }))
  accounts.get = mock((addr: string): TestAccount | undefined =>
    addr === address ? { id: address, address, lastSignerType: 'ring' } : undefined
  )
  accounts.signTransaction = createSignTransactionMock()
  accounts.setTxSigned = createSetTxSignedMock()
  accounts.getFrameAccount = createGetFrameAccountMock()
  accounts.trackAutonomousTransaction = createTrackAutonomousTransactionMock()
})

afterEach(() => {
  timers.useRealTimers()
})

function mockConnectionError(message: string) {
  connection.send.mockImplementation((payload: RPCRequestPayload, callback: RPCRequestCallback) =>
    callback({ id: payload.id, jsonrpc: payload.jsonrpc, error: { message, code: -1 } })
  )
}

describe('#send', () => {
  beforeEach(() => {
    setOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087', {
      chain: { id: 1, type: 'ethereum', on: true }
    })
  })

  const send = (
    request: object,
    cb: RPCRequestCallback = mock(),
    requestPrincipal: TrustedPrincipal = principal
  ) => {
    void provider.send(
      { ...request, _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087' } as RPCRequestPayload,
      cb,
      requestPrincipal
    )
  }
  const sendResult = (request: object, requestPrincipal: TrustedPrincipal = principal) =>
    new Promise<RPCResponsePayload>((resolve) => send(request, resolve, requestPrincipal))

  ;[
    ['unknown', '0x63'],
    ['invalid', 'test']
  ].forEach(([description, chainId]) => {
    it(`returns an error when an ${description} chain is given`, async () => {
      const response = await sendResult({ method: 'eth_testFrame', chainId })
      expect(connection.send).not.toHaveBeenCalled()
      expect(responseError(response).message).toMatch(/unknown chain/)
      expect(response.result).toBeUndefined()
    })
  })

  it('rejects signing methods that do not carry a trusted transport principal', () => {
    const callback = mock()

    void provider.send(
      {
        id: 1,
        jsonrpc: '2.0',
        method: 'personal_sign',
        params: ['hello', address],
        chainId: '0x1',
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
      },
      callback
    )

    expect(callback).toHaveBeenCalled()
    expect(callback.mock.calls[0]?.[0]).toMatchObject({
      error: { code: 4100, message: 'Wallet action is missing a trusted request source' }
    })
    expect(accountRequests).toHaveLength(0)
  })

  describe('#eth_chainId', () => {
    ;(
      [
        ['current', 1],
        ['target', 5]
      ] as const
    ).forEach(([description, chain]) => {
      it(`returns the ${description} chain id from the store`, async () => {
        setNetwork(chain, { id: chain, on: true })
        expect((await sendResult({ method: 'eth_chainId', chainId: `0x${chain}` })).result).toBe(`0x${chain}`)
      })
    })

    it('returns an error for a disabled chain', async () => {
      setNetwork(5, { id: 5, on: false })
      const response = await sendResult({ method: 'eth_chainId', chainId: '0x5' })
      expect(responseError(response).message).toBe('not connected')
      expect(response.result).toBeUndefined()
    })
  })

  describe('#frame_getOriginStatus', () => {
    const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'
    const cases: Array<[string, TrustedPrincipal, number, boolean, string, string]> = [
      ['returns the permitted address', principal, 42161, true, address, ''],
      ['exposes the selected address to internal requests', internalPrincipal, 1, false, '', address],
      ['hides the selected address from external requests', principal, 1, false, '', '']
    ]
    cases.forEach(([description, source, chainId, permitted, visibleAddress, selectedAddress]) => {
      it(description, async () => {
        setOrigin(originId, { name: 'frame.test', chain: { id: chainId, type: 'ethereum' } })
        setPermissions(address, permitted ? { [originId]: { origin: 'frame.test', provider: true } } : {})
        expect((await sendResult({ method: 'frame_getOriginStatus' }, source)).result).toEqual({
          originId,
          origin: 'frame.test',
          connected: permitted,
          address: visibleAddress,
          selectedAddress,
          chainId: `0x${Number(chainId).toString(16)}`
        })
      })
    })
  })

  describe('#frame_disconnectOrigin', () => {
    it('removes the selected account permission and notifies origin account subscribers', (done) => {
      const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'
      const subscription = {
        id: '0x9509a964a8d24a17fcfc7b77fc575b71',
        originId,
        capabilities: []
      }

      accounts.clearRequestsByOrigin = mock()
      provider.subscriptions.accountsChanged = [subscription]
      setOrigin(originId, {
        name: 'frame.test',
        chain: { id: 1, type: 'ethereum' },
        session: { requests: 3, startedAt: 1, lastUpdatedAt: 2 }
      })
      setPermissions(address, {
        [originId]: {
          origin: 'frame.test',
          provider: true
        }
      })

      let subscriptionEvent: { params?: unknown }
      provider.once('data:subscription', (payload: { params?: unknown }) => {
        subscriptionEvent = payload
      })

      send({ method: 'frame_disconnectOrigin' }, (response) => {
        expect(response.error).toBeUndefined()
        const result = rpcResult<{ connected: boolean; address: string }>(response)
        expect(result.connected).toBe(false)
        expect(result.address).toBe('')
        expect(storeState().main.permissions[address][originId]).toBeUndefined()
        expect(typeof storeState().main.origins[originId].session.endedAt).toBe('number')
        expect(accounts.clearRequestsByOrigin).toHaveBeenCalledWith(address, originId)
        const params = subscriptionEvent.params as { subscription: string; result: unknown }
        expect(params.subscription).toBe(subscription.id)
        expect(params.result).toEqual([])
        done()
      })
    })
  })

  describe('#wallet_addEthereumChain', () => {
    const chainRequest = (overrides: Record<string, unknown> = {}) => ({
      chainId: '0x1234',
      chainName: 'Bizarro Polygon',
      nativeCurrency: { name: 'New', symbol: 'NEW', decimals: 18 },
      rpcUrls: ['https://rpc.example.com'],
      blockExplorerUrls: ['https://explorer.example.com'],
      ...overrides
    })
    const sendRequest = (chain: ReturnType<typeof chainRequest>, cb: RPCRequestCallback) =>
      send({ method: 'wallet_addEthereumChain', params: [chain] }, cb)

    it('creates an add-chain request with its Chainlist icon', async () => {
      const cb = mock()
      lookupChainIcon.mockImplementation(
        async () => 'https://icons.llamao.fi/icons/chains/rsz_bizarro-polygon.jpg'
      )
      sendRequest(chainRequest(), cb)
      await Promise.resolve()

      expect(accountRequests).toHaveLength(1)
      expect(lookupChainIcon).toHaveBeenCalledWith(4660)
      expect(accountRequests[0]).toEqual(
        expect.objectContaining({
          type: 'addChain',
          chain: {
            type: 'ethereum',
            id: 4660,
            name: 'Bizarro Polygon',
            icon: 'https://icons.llamao.fi/icons/chains/rsz_bizarro-polygon.jpg',
            symbol: 'NEW',
            nativeCurrencyName: 'New',
            primaryRpc: 'https://rpc.example.com',
            secondaryRpc: undefined,
            explorer: 'https://explorer.example.com'
          }
        }) as unknown as AccountRequest
      )
      expect(typeof accountRequests[0].handlerId).toBe('string')
    })

    it('rejects unsafe RPC and block explorer URLs', () => {
      const rpcResponse = mock((_response: RPCResponsePayload) => {})
      const explorerResponse = mock((_response: RPCResponsePayload) => {})

      sendRequest(chainRequest({ rpcUrls: ['file:///tmp/rpc'] }), rpcResponse)
      // oxlint-disable-next-line no-script-url -- Verify rejection of an executable explorer URL.
      sendRequest(chainRequest({ blockExplorerUrls: ['javascript:alert(1)'] }), explorerResponse)

      expect(rpcError(rpcResponse.mock.calls[0][0]).message).toMatch(/invalid rpc url/i)
      expect(rpcError(explorerResponse.mock.calls[0][0]).message).toMatch(/invalid block explorer url/i)
      expect(accountRequests).toHaveLength(0)
    })

    it('switches immediately when an add-chain target already exists', () => {
      setNetwork(1, {
        id: 1,
        on: true,
        connection: { primary: { custom: 'https://trusted.example.com' } }
      })
      setOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087', {
        chain: { id: 137, type: 'ethereum' }
      })
      const switchOriginChain = spyOn(storeState(), 'switchOriginChain').mockImplementation(() => undefined)

      sendRequest(
        chainRequest({
          chainId: '0x1',
          nativeCurrency: { symbol: 'ETH' },
          rpcUrls: ['https://attacker.example.com']
        }),
        mock()
      )

      expect(accountRequests).toHaveLength(0)
      expect(switchOriginChain).toHaveBeenCalledWith('8073729a-5e59-53b7-9e69-5d9bcff94087', 1, 'ethereum')
      expect(storeState().main.networks.ethereum[1].connection.primary.custom).toBe(
        'https://trusted.example.com'
      )
    })

    it('enriches a disabled chain with its Chainlist icon and ignores requested RPC replacements', async () => {
      setNetwork(31337, {
        id: 31337,
        on: false,
        connection: {
          primary: {
            on: false,
            current: 'custom',
            custom: ''
          }
        }
      })
      setOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087', {
        chain: { id: 1, type: 'ethereum' }
      })
      lookupChainIcon.mockImplementation(
        async () => 'https://icons.llamao.fi/icons/chains/rsz_newframe-local-anvil.jpg'
      )

      const cb = mock()

      sendRequest(
        chainRequest({
          chainId: '0x7a69',
          chainName: 'Newframe Local Anvil',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://attacker.example.com']
        }),
        cb
      )
      await Promise.resolve()

      expect(accountRequests).toHaveLength(1)
      expect(lookupChainIcon).toHaveBeenCalledWith(31337)
      const network = storeState().main.networks.ethereum[31337]
      expect(network.on).toBe(false)
      expect(network.connection.primary.on).toBe(false)
      expect(network.connection.primary.custom).toBe('')
      expect((accountRequests[0] as AddChainRequest).chain.icon).toBe(
        'https://icons.llamao.fi/icons/chains/rsz_newframe-local-anvil.jpg'
      )
      expect((accountRequests[0] as AddChainRequest).chain).not.toHaveProperty('primaryRpc')
    })
  })

  describe('#wallet_switchEthereumChain', () => {
    it('switches an origin to an existing chain without prompting', async () => {
      setNetwork(1, { id: 1, on: true })
      setOrigins({
        '8073729a-5e59-53b7-9e69-5d9bcff94087': { chain: { id: 42161, type: 'ethereum' } }
      })
      const switchOriginChain = spyOn(storeState(), 'switchOriginChain').mockImplementation(() => undefined)

      await sendResult({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })
      expect(accountRequests).toHaveLength(0)
      expect(switchOriginChain).toHaveBeenCalledWith('8073729a-5e59-53b7-9e69-5d9bcff94087', 1, 'ethereum')
    })

    it('should reject with the correct error if the chain does not exist in the store', async () => {
      const response = await sendResult({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1234' }]
      })
      expect(responseError(response).code).toBe(4902)
      expect(accountRequests).toHaveLength(0)
    })
  })

  describe('#wallet_requestPermissions', () => {
    it('returns the requested permissions', async () => {
      const permissions = rpcResult<Array<{ parentCapability: string; date: number }>>(
        await sendResult({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }, { eth_signTransaction: {} }]
        })
      )
      expect(
        permissions.map(({ parentCapability, date }) => [parentCapability, Number.isInteger(date)])
      ).toEqual([
        ['eth_accounts', true],
        ['eth_signTransaction', true]
      ])
    })
  })

  describe('#wallet_watchAsset', () => {
    interface WatchAssetRequest {
      id: number
      jsonrpc: '2.0'
      method: string
      _origin: string
      params: {
        type?: string
        options: { address?: string; symbol: string; name: string; decimals: number; image: string }
      }
    }
    let request: WatchAssetRequest

    beforeEach(() => {
      setNetwork(1, { id: 1, on: true })
      store.setState((state) => {
        state.main.tokens = { byId: {}, accountTokenIds: {} }
      })

      request = {
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087',
        id: 10,
        jsonrpc: '2.0',
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e',
            symbol: 'BADGER',
            name: 'BadgerDAO Token',
            decimals: 18,
            image: 'https://badgerdao.io/icon.jpg'
          }
        }
      }
    })

    it('adds a request for a custom token', () => {
      send(request)
      expect(accountRequests).toHaveLength(1)
      expect(validateUUID(accountRequests[0].handlerId)).toBe(true)
      expect(accountRequests[0]).toEqual(
        expect.objectContaining({
          type: 'addToken',
          account: address,
          token: {
            chainId: 1,
            address: '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e',
            symbol: 'BADGER',
            name: 'BadgerDAO Token',
            decimals: 18,
            logoURI: 'https://badgerdao.io/icon.jpg'
          },
          payload: request
        }) as unknown as AccountRequest
      )
    })

    it('does not add a request for a token that is already added', async () => {
      store.setState((state) => {
        const token = request.params.options
        if (!token.address) {
          throw new Error('Expected token address')
        }
        state.main.tokens.byId[`1:${token.address}`] = {
          address: token.address,
          chainId: 1,
          decimals: token.decimals,
          name: token.name,
          symbol: token.symbol,
          custom: true,
          curated: false,
          sources: ['custom'],
          updatedAt: 0
        }
      })

      expect((await sendResult(request)).result).toBe(true)
      expect(accountRequests).toHaveLength(0)
    })
    const networkCases: Array<[string, NetworkOverrides | undefined]> = [
      ['does not exist', undefined],
      ['is disabled', { id: 1, on: false }]
    ]
    networkCases.forEach(([description, network]) => {
      it(`rejects a request when the chain ${description}`, async () => {
        setNetwork(1, network)
        const error = responseError(await sendResult(request))
        expect(error.code).toBe(-1)
        expect(error.message).toContain('not connected')
        expect(accountRequests).toHaveLength(0)
      })
    })
    ;[
      ['missing', undefined],
      ['not ERC-20', 'ERC721']
    ].forEach(([description, type]) => {
      it(`rejects a request whose type is ${description}`, async () => {
        request.params.type = type
        const error = responseError(await sendResult(request))
        expect(error.code).toBe(-1)
        expect(error.message).toContain('only ERC-20 tokens are supported')
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request with no token address', async () => {
      delete request.params.options.address
      const error = responseError(await sendResult(request))
      expect(error.code).toBe(-1)
      expect(error.message).toMatch('tokens must define an address')
      expect(accountRequests).toHaveLength(0)
    })
  })

  describe('#wallet_getEthereumChains', () => {
    it('returns only enabled chains through the provider', async () => {
      setNetwork(1, { name: 'mainnet', on: true, connection: { primary: { connected: true } } })
      setNetwork(137, { name: 'polygon', on: false, connection: { primary: { connected: false } } })

      const response = await sendResult({ method: 'wallet_getEthereumChains', id: 14, jsonrpc: '2.0' })
      expect(response).toMatchObject({ id: 14, jsonrpc: '2.0' })
      expect(rpcResult<Array<{ chainId: number }>>(response).map(({ chainId }) => chainId)).toEqual([1])
    })
  })

  describe('#wallet_getAssets', () => {
    const token = {
      address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
      chainId: 1,
      symbol: 'OHM',
      balance: '0xd14d13208',
      displayBalance: '56.183829'
    }

    beforeEach(() => {
      store.setState((state) => {
        state.main.accounts[address] = AccountSchema.parse({
          id: address,
          profileId: 'test-profile',
          address,
          name: 'Test account',
          lastSignerType: 'ring',
          status: 'ok',
          signer: 'test-signer',
          requests: {},
          created: new Date(0).toISOString(),
          balances: { lastUpdated: new Date() }
        })
        state.main.balances[address] = [token]
        state.main.tokens.byId[`1:${token.address}`] = {
          ...token,
          decimals: 9,
          name: 'Olympus DAO',
          custom: false,
          curated: false,
          sources: ['onchain'],
          updatedAt: 0
        }
      })
    })

    it('returns an error if no account is selected', async () => {
      accounts.current.mockReturnValueOnce(null)
      const response = await sendResult({ method: 'wallet_getAssets', id: 21, jsonrpc: '2.0' })
      expect(response).toMatchObject({ id: 21, jsonrpc: '2.0' })
      expect(responseError(response).message).toMatch(/no account selected/i)
      expect(response.result).toBeUndefined()
    })

    it('returns the current account assets through the provider', async () => {
      expect(rpcResult<{ erc20: unknown[] }>(await sendResult({ method: 'wallet_getAssets' })).erc20).toEqual(
        [expect.objectContaining(token)]
      )
    })

    it('returns an error while scanning', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      store.setState((state) => {
        Object.assign(state.main.accounts[address], { balances: { lastUpdated: yesterday } })
      })

      const response = await sendResult({ method: 'wallet_getAssets', id: 51, jsonrpc: '2.0' })
      expect(response).toMatchObject({ id: 51, jsonrpc: '2.0', error: { code: 5901 } })
      expect(response.result).toBeUndefined()
    })
  })

  describe('#eth_getTransactionByHash', () => {
    const chain = 5
    const txHash = '0x06c1c968d4bd20c0ebfed34f6f34d8a5d189d9d2ce801f2ee8dd45dac32628d5'
    const request = {
      method: 'eth_getTransactionByHash',
      params: [txHash],
      chainId: '0x' + chain.toString(16)
    }

    let blockResult: Record<string, unknown>

    beforeEach(() => {
      connection.send.mockImplementation((payload, res, targetChain) => {
        expect(targetChain?.id).toBe(chain)
        expect(payload.params[0]).toBe(txHash)

        return res({ id: payload.id, jsonrpc: payload.jsonrpc, result: blockResult })
      })
    })

    const maxFeePerGas = `0x${(10e9).toString(16)}`
    const cases: Array<[string, Record<string, unknown>]> = [
      ['uses maxFeePerGas as gasPrice when absent', { maxFeePerGas, gasPrice: maxFeePerGas }],
      ['maintains an existing gasPrice', { gasPrice: `0x${(8e9).toString(16)}`, maxFeePerGas }]
    ]
    cases.forEach(([description, result]) => {
      it(description, async () => {
        blockResult = result
        expect((await sendResult(request)).result).toEqual(result)
      })
    })
  })

  describe('#eth_sendTransaction', () => {
    let tx: TransactionData

    const sendTransaction = (
      cb: RPCRequestCallback,
      chainId?: string,
      context?: TransactionRequestContext
    ) => {
      const payload = {
        jsonrpc: '2.0' as const,
        id: 7,
        method: 'eth_sendTransaction',
        params: [tx],
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
      }

      if (chainId) {
        Object.assign(payload, { chainId })
      }

      void provider.send(payload, cb, principal, context)
    }
    const sendTransactionResult = (chainId?: string, context?: TransactionRequestContext) =>
      new Promise<RPCResponsePayload>((resolve) => sendTransaction(resolve, chainId, context))

    beforeEach(() => {
      tx = {
        from: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
        to: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
        chainId: '0x1',
        gasLimit: intToHex(21000),
        type: '0x1',
        nonce: '0xa',
        gasFeesSource: GasFeesSource.Dapp
      }

      const chainIds = [1, 137]

      chainIds.forEach((chainId) => {
        setNetworkGas(chainId, {
          samples: [],
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: gweiToHex(30), asap: '', custom: '' },
            fees: {
              maxPriorityFeePerGas: gweiToHex(1),
              maxBaseFeePerGas: gweiToHex(8)
            }
          }
        })

        connection.connections.ethereum[chainId] = {
          primary: {
            connected: true
          },
          chainConfig: chainConfig(chainId, chainId === 1 ? 'london' : 'istanbul')
        }
      })
    })

    it('releases its response handler when a transaction request is rejected', async () => {
      await expectQueuedRequestRejection((callback) => sendTransaction(callback))
    })

    it('rejects a transaction with a mismatched chain id', async () => {
      const response = await sendTransactionResult('0x5')
      expect(responseError(response).message).toMatch(/does not match/i)
      expect(response.result).toBeUndefined()
    })

    it('populates the transaction with the request chain id if not provided in the transaction', async () => {
      delete (tx as Partial<TransactionData>).chainId
      await sendTransactionResult('0x89')
      expect((accountRequests[0] as TransactionRequest).data.chainId).toBe('0x89')
    })

    it('maintains transaction chain id if no target chain provided with the request', async () => {
      tx.chainId = '0x89'
      await sendTransactionResult()
      expect((accountRequests[0] as TransactionRequest).data.chainId).toBe('0x89')
    })

    it('seeds canonical token metadata from the trusted internal context', async () => {
      const tokenData = { decimals: 6, name: 'USD Coin', symbol: 'USDC' }

      await sendTransactionResult(undefined, { tokenData })

      expect((accountRequests[0] as TransactionRequest).tokenData).toEqual(tokenData)
    })

    it('rejects a Safe transaction when the target chain has no deployment', async () => {
      accounts.get = mock((addr: string): TestAccount | undefined =>
        addr === address ? { id: address, address, lastSignerType: 'safe', safe: { '137': {} } } : undefined
      )

      const response = await sendTransactionResult()

      expect(responseError(response).message).toBe('Safe is not configured on chain 1')
      expect(prepareSafeDraft).not.toHaveBeenCalled()
      expect(connection.refreshGasFees).not.toHaveBeenCalled()
      expect(accountRequests).toHaveLength(0)
    })

    it('normalizes and locally decodes a Safe proposal before attaching it after routing', async () => {
      const recipient = '0x1111111111111111111111111111111111111111'
      const transferTo = '0x3333333333333333333333333333333333333333'
      const calldata = `0xa9059cbb${transferTo.slice(2).padStart(64, '0')}${'2a'.padStart(64, '0')}`
      const sequence: string[] = []
      delete tx.nonce
      delete tx.gasLimit
      tx.to = recipient
      tx.value = '0x2a'
      tx.data = calldata
      accounts.get = mock((addr: string): TestAccount | undefined =>
        addr === address ? { id: address, address, lastSignerType: 'safe', safe: { '1': {} } } : undefined
      )
      decodeTransactionCalldata.mockImplementationOnce(async () => {
        sequence.push('decode')
        return {
          contractAddress: recipient,
          contractName: 'Token',
          source: 'Local ABI',
          selector: '0xa9059cbb',
          signature: 'transfer(address,uint256)',
          method: 'transfer',
          args: [
            { name: 'to', type: 'address', value: transferTo },
            { name: 'amount', type: 'uint256', value: '42' }
          ]
        }
      })
      prepareSafeDraft.mockImplementationOnce(() => {
        sequence.push('prepare')
        return { accountId: address, chainId: 1, proposal: { safeTxHash } } as never
      })
      attachSafeDraft.mockImplementationOnce((draft, requestId) => {
        sequence.push('attach')
        expect(accountRequests).toHaveLength(1)
        expect(accountRequests[0].handlerId).toBe(requestId)
        expect(draft).toMatchObject({ accountId: address, chainId: 1 })
        return safeTxHash
      })

      await sendTransactionResult()

      expect(connection.refreshGasFees).not.toHaveBeenCalled()
      expect(decodeTransactionCalldata).toHaveBeenCalledWith(recipient, 1, calldata)
      expect(sequence).toEqual(['decode', 'prepare', 'attach'])
      expect(prepareSafeDraft).toHaveBeenCalledWith({
        accountId: address,
        chainId: 1,
        to: recipient,
        value: '42',
        data: calldata,
        operation: 0,
        origin: '8073729a-5e59-53b7-9e69-5d9bcff94087',
        localDecoded: {
          method: 'transfer',
          parameters: [
            { name: 'to', type: 'address', value: transferTo },
            { name: 'amount', type: 'uint256', value: '42' }
          ],
          source: 'Local ABI'
        }
      })
      expect(attachSafeDraft).toHaveBeenCalledTimes(1)
      expect(accountRequests[0]).toMatchObject({
        account: address,
        safeTxHash,
        data: { to: recipient, value: '0x2a', data: calldata, chainId: '0x1' }
      })
      expect((accountRequests[0] as TransactionRequest).data.from?.toLowerCase()).toBe(address)
    })

    it('falls back to raw Safe calldata when decoding is unknown, malformed, or exceeds persisted bounds', async () => {
      const recipient = '0x1111111111111111111111111111111111111111'
      delete tx.nonce
      delete tx.gasLimit
      tx.to = recipient
      tx.data = '0x12345678'
      accounts.get = mock((addr: string): TestAccount | undefined =>
        addr === address ? { id: address, address, lastSignerType: 'safe', safe: { '1': {} } } : undefined
      )
      decodeTransactionCalldata
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('malformed calldata'))
        .mockResolvedValueOnce({
          contractAddress: recipient,
          contractName: 'Unknown Contract',
          source: 'x'.repeat(201),
          selector: '0x12345678',
          signature: 'unknown()',
          method: 'unknown',
          args: []
        })

      await sendTransactionResult()
      tx = { ...tx, data: '0xa9059cbb00' }
      await sendTransactionResult()
      tx = { ...tx, data: '0x12345678' }
      await sendTransactionResult()

      expect(prepareSafeDraft).toHaveBeenCalledTimes(3)
      expect(prepareSafeDraft.mock.calls[0][0]).not.toHaveProperty('localDecoded')
      expect(prepareSafeDraft.mock.calls[1][0]).not.toHaveProperty('localDecoded')
      expect(prepareSafeDraft.mock.calls[2][0]).not.toHaveProperty('localDecoded')
      expect(attachSafeDraft).toHaveBeenCalledTimes(3)
    })

    it('does not attach a Safe proposal when authorization rejects routing', async () => {
      delete tx.nonce
      accounts.get = mock((addr: string): TestAccount | undefined =>
        addr === address ? { id: address, address, lastSignerType: 'safe', safe: { '1': {} } } : undefined
      )
      const route = accounts.routeRequest.bind(accounts)
      accounts.routeRequest = () => false
      try {
        sendTransaction(mock())
        expect(prepareSafeDraft).toHaveBeenCalledTimes(1)
        expect(attachSafeDraft).not.toHaveBeenCalled()
      } finally {
        accounts.routeRequest = route
      }
    })

    it('switches to a known account matching the transaction from address', async () => {
      const nextAddress = '0x35f9179059a691d8beecf82fe112f7277e018588'
      let currentAddress = address

      tx.from = nextAddress

      accounts.current = mock(() => ({ id: currentAddress, getAccounts: () => [currentAddress] }))
      accounts.get = mock((addr: string): TestAccount | undefined =>
        addr === nextAddress
          ? {
              id: nextAddress,
              address: nextAddress,
              lastSignerType: 'ring',
              getAccounts: () => [nextAddress]
            }
          : undefined
      )
      accounts.setSigner = mock((id: string, cb: Callback<TestAccount>) => {
        currentAddress = id
        cb(null, { id, address: id, lastSignerType: 'ring' })
      })

      await sendTransactionResult()
      expect(accounts.setSigner).toHaveBeenCalledWith(nextAddress, expect.any(Function))
      expect(accountRequests[0].account).toBe(nextAddress)
      expect((accountRequests[0] as TransactionRequest).data.from?.toLowerCase()).toBe(nextAddress)
    })

    it('pads the gas estimate from the network by 50 percent', async () => {
      connection.send.mockImplementationOnce((payload, cb) => {
        expect(payload.method).toBe('eth_estimateGas')
        cb({ id: payload.id, jsonrpc: payload.jsonrpc, result: addHexPrefix((150000).toString(16)) })
      })

      delete tx.gasLimit

      await sendTransactionResult()
      expect((accountRequests[0] as TransactionRequest).data.gasLimit).toBe(
        addHexPrefix((225000).toString(16))
      )
    })

    it('publishes required approvals with the initial transaction request', async () => {
      connection.send.mockImplementationOnce((payload, cb) => {
        cb({
          id: payload.id,
          jsonrpc: payload.jsonrpc,
          error: { message: 'Unable to estimate gas', code: -1 }
        })
      })
      delete tx.gasLimit

      await sendTransactionResult()
      expect((accountRequests[0] as TransactionRequest).approvals).toEqual([
        {
          type: 'approveGasLimit',
          data: { message: 'Unable to estimate gas', gasLimit: '0x00' },
          approved: false
        }
      ])
    })

    it('uses gasPrice from input params for legacy transactions', async () => {
      tx.gasPrice = '0x00'
      await sendTransactionResult()
      expect((accountRequests[0] as TransactionRequest).data.gasPrice).toBe('0x00')
    })
  })

  describe('#eth_sign', () => {
    const message = 'hello, Ethereum!'
    const hexMessage = addHexPrefix(Buffer.from(message, 'utf-8').toString('hex'))

    it.each(['eth_sign', 'eth_signTransaction'])('rejects %s before request creation', async (method) => {
      const response = await sendResult({ method, params: [address, hexMessage] })
      expect(responseError(response)).toEqual({
        code: 4200,
        message: `${method} is not supported; use personal_sign or eth_sendTransaction`
      })
      expect(accountRequests).toHaveLength(0)
      expect(requestContinuations.callbacks.size).toBe(0)
    })
  })

  describe('#personal_sign', () => {
    const message = 'hello, Ethereum!'
    const password = 'supersecret'
    const hexMessage = addHexPrefix(Buffer.from(message, 'utf-8').toString('hex'))

    const personalSignCases: ReadonlyArray<readonly [string, readonly string[], string]> = [
      ['address first', [address, hexMessage, password], hexMessage],
      ['message first', [hexMessage, address, password], hexMessage],
      [
        '20-byte message first',
        ['0x6672616d652e7368206973206772656174212121', address, password],
        '0x6672616d652e7368206973206772656174212121'
      ]
    ]
    personalSignCases.forEach(([description, params, expectedMessage]) => {
      it(`submits a request with the ${description}`, () => {
        send({ method: 'personal_sign', params })
        expect(accountRequests[0]).toMatchObject({
          payload: { params: [address, expectedMessage, password] }
        })
        expect(typeof accountRequests[0].handlerId).toBe('string')
      })
    })

    it('does not submit a request from an account other than the current one', async () => {
      const params = [message, '0xa4581bfe76201f3aa147cce8e360140582260441']
      expect((await sendResult({ method: 'personal_sign', params })).error).toBeTruthy()
    })
  })

  describe('#eth_signTypedData', () => {
    const typedData = {
      types: {
        EIP712Domain: [],
        Message: [{ name: 'contents', type: 'string' }]
      },
      domain: {},
      primaryType: 'Message',
      message: { contents: 'Hello!' }
    }

    const typedDataLegacy = [{ type: 'string', name: 'fullName', value: 'Satoshi Nakamoto' }]

    const variants: Array<[string, unknown, SignTypedDataVersion, string]> = [
      ['eth_signTypedData', typedDataLegacy, SignTypedDataVersion.V1, 'legacy'],
      ['eth_signTypedData', typedData, SignTypedDataVersion.V4, 'eip-712'],
      ['eth_signTypedData_v1', typedDataLegacy, SignTypedDataVersion.V1, 'legacy'],
      ['eth_signTypedData_v3', typedData, SignTypedDataVersion.V3, 'eip-712'],
      ['eth_signTypedData_v4', typedData, SignTypedDataVersion.V4, 'eip-712']
    ]
    const validRequests = variants.flatMap(([method, data, version, dataDescription]) => [
      { method, params: [address, data], version, dataDescription },
      { method, params: [data, address], version, dataFirst: true, dataDescription }
    ])

    function verifyRequest(version: SignTypedDataVersion, expectedPayload: unknown) {
      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toStrictEqual(expectedPayload)
      const request = accountRequests[0] as SignTypedDataRequest
      expect(request.typedMessage.version).toBe(version)
      expect<unknown>(request.typedMessage.data).toStrictEqual(expectedPayload)
    }

    validRequests.forEach(({ method, params, version, dataFirst, dataDescription }) => {
      it(`submits an ${method} request supplying ${dataDescription} data${
        dataFirst ? ' (inverted params)' : ''
      }`, () => {
        send({ method, params })

        const expectedPayload = params[dataFirst ? 0 : 1]
        verifyRequest(version, expectedPayload)
      })
    })

    it('returns typed-data rejection and releases its response handler', async () => {
      await expectQueuedRequestRejection((callback) =>
        send({ method: 'eth_signTypedData_v4', params: [address, typedData] }, callback)
      )
    })

    beforeEach(() => {
      accounts.current.mockReturnValue(frameAccountFixture())
    })

    it('handles typed data as a stringified json param', () => {
      const params = [JSON.stringify(typedData), address]

      send({ method: 'eth_signTypedData', params })

      verifyRequest(SignTypedDataVersion.V4, typedData)
    })
    const invalidCases: Array<[string, unknown[], string]> = [
      ['without a message', [address, { ...typedData, message: undefined }], 'Typed data missing message'],
      [
        'from an unknown account',
        ['0xa4581bfe76201f3aa147cce8e360140582260441', typedData],
        'Unknown account: 0xa4581bfe76201f3aa147cce8e360140582260441'
      ],
      ['with malformed data', [address, 'test'], 'Malformed typed data']
    ]
    invalidCases.forEach(([description, params, message]) => {
      it(`does not submit a request ${description}`, async () => {
        expect(responseError(await sendResult({ method: 'eth_signTypedData_v3', params }))).toEqual({
          message,
          code: -1
        })
      })
    })

    it('does not submit a request to the wrong account', async () => {
      accounts.current.mockReturnValueOnce(
        frameAccountFixture({ id: '0xa4581bfe76201f3aa147cce8e360140582260441' })
      )
      expect(
        (await sendResult({ method: 'eth_signTypedData_v3', params: [address, typedData] })).error
      ).toEqual({
        message: 'Sign request is not from currently selected account',
        code: -1
      })
    })

    // these signers only support V4+
    const HardwareSignersSupportingV4Only = [SignerType.Ledger, SignerType.Trezor, SignerType.AirGap]

    HardwareSignersSupportingV4Only.forEach((signerType) => {
      it(`does not submit a V3 request to a ${signerType}`, async () => {
        accounts.get.mockImplementationOnce((addr: string) => {
          return addr === address
            ? { id: address, address, lastSignerType: signerType, getAccounts: () => [address] }
            : undefined
        })

        const params = [address, typedData]

        const error = responseError(await sendResult({ method: 'eth_signTypedData_v3', params }))
        expect(error.message).toMatch(new RegExp(signerType, 'i'))
        expect(error.code).toBe(-1)
      })
    })

    it('should submit a V3 request to a Lattice', () => {
      accounts.get.mockImplementationOnce((addr: string) => {
        return addr === address
          ? { id: address, address, lastSignerType: SignerType.Lattice, getAccounts: () => [address] }
          : undefined
      })
      const params = [address, typedData]

      send({ method: 'eth_signTypedData_v3', params })

      verifyRequest(SignTypedDataVersion.V3, typedData)
    })

    const unknownVersions = ['_v5', '_v1.1', 'v3']

    unknownVersions.forEach((versionExtension) => {
      it(`passes a request with unhandled method eth_signTypedData${versionExtension} through to the connection`, async () => {
        mockConnectionError('received unhandled request')
        const params = [address, 'test']
        expect(
          responseError(await sendResult({ method: `eth_signTypedData${versionExtension}`, params })).message
        ).toBe('received unhandled request')
      })
    })
  })

  describe('subscriptions', () => {
    type TestSubscriptionType = 'accountsChanged' | 'chainChanged' | 'chainsChanged' | 'networkChanged'
    const eventTypes: TestSubscriptionType[] = [
      'accountsChanged',
      'chainChanged',
      'chainsChanged',
      'networkChanged'
    ]

    describe('#eth_subscribe', () => {
      const subscribe = (eventType: string) =>
        sendResult({ id: 9, jsonrpc: '2.0', method: 'eth_subscribe', params: [eventType] })

      eventTypes.forEach((eventType) => {
        it(`subscribes to ${eventType} events`, async () => {
          const response = await subscribe(eventType)
          expect(response).toMatchObject({ id: 9, jsonrpc: '2.0' })
          expect(response.error).toBeUndefined()
          expect(response.result).toMatch(/0x\w{32}$/)
          expect(provider.subscriptions[eventType]).toHaveLength(1)
          expect(provider.subscriptions[eventType][0].capabilities).toEqual([])
        })
      })

      it('returns an error from the node if attempting to unsubscribe to an unknown event', async () => {
        mockConnectionError('unknown event!')
        const response = await subscribe('everythingChanged')
        expect(response).toMatchObject({ id: 9, jsonrpc: '2.0', error: { message: 'unknown event!' } })
        expect(response.result).toBeUndefined()
      })
    })

    describe('#eth_unsubscribe', () => {
      const unsubscribe = (id: string) =>
        sendResult({ id: 8, jsonrpc: '2.0', method: 'eth_unsubscribe', params: [id] })

      eventTypes.forEach((eventType) => {
        it(`unsubscribes from ${eventType} events`, async () => {
          const subId = '0x1acc2933618a0ff548f03b1c99420366'
          provider.subscriptions[eventType] = [{ id: subId, originId: '', capabilities: [] }]
          expect(await unsubscribe(subId)).toMatchObject({ id: 8, jsonrpc: '2.0', result: true })
          expect(provider.subscriptions[eventType]).toHaveLength(0)
        })
      })

      it('returns an error from the node if attempting to unsubscribe from an unknown subscription', async () => {
        mockConnectionError('unknown subscription!')

        provider.subscriptions.accountsChanged = [{ id: '0xtest1', originId: '', capabilities: [] }]
        provider.subscriptions.chainChanged = [{ id: '0xtest2', originId: '', capabilities: [] }]
        provider.subscriptions.chainsChanged = [{ id: '0xtest2', originId: '', capabilities: [] }]
        provider.subscriptions.networkChanged = [{ id: '0xtest3', originId: '', capabilities: [] }]

        expect(await unsubscribe('0xanothersub')).toMatchObject({
          id: 8,
          jsonrpc: '2.0',
          error: { message: 'unknown subscription!' }
        })
        eventTypes.forEach((eventType) => expect(provider.subscriptions[eventType]).toHaveLength(1))
      })
    })
  })
})

describe('#executeAgentTransaction', () => {
  it.each([false, true])(
    'broadcasts and records activity only for an active session, revoked: %s',
    (revoked) => {
      let active = true
      const agentPrincipal = createAgentPrincipal({
        sessionId: 'agent-session',
        accountId: address,
        expiresAt: Date.now() + 60_000,
        isActive: () => active
      })
      const signTransaction = createSignTransactionMock()
      const account = { id: address, signTransaction }
      const request: TransactionRequest = {
        handlerId: 'agent-request',
        type: 'transaction',
        origin: 'agent',
        account: address,
        payload: {
          id: 'agent-rpc-request',
          jsonrpc: '2.0',
          method: 'eth_sendTransaction',
          params: [],
          _origin: 'agent'
        },
        data: {
          chainId: '0xa',
          type: '0x0',
          gasPrice: '0x1',
          gasLimit: '0x5208',
          nonce: '0x0',
          gasFeesSource: GasFeesSource.Dapp
        },
        approvals: [],
        feesUpdatedByUser: false,
        recipientType: 'unknown',
        recognizedActions: [],
        classification: TxClassification.NATIVE_TRANSFER
      }
      const respond = mock((_response: RPCResponsePayload) => {})

      provider.executeAgentTransaction(account, request, agentPrincipal, respond)
      expect(signTransaction).toHaveBeenCalledTimes(1)

      active = !revoked
      signTransaction.mock.calls[0][1](null, '0xsigned')

      if (revoked) {
        expect(connection.send).not.toHaveBeenCalled()
        expect(accounts.trackAutonomousTransaction).not.toHaveBeenCalled()
        expect(respond).toHaveBeenCalledTimes(1)
        expect(respond.mock.calls[0]?.[0]).toMatchObject({
          error: { message: 'Agent session is revoked or unavailable' }
        })
      } else {
        expect(connection.send).toHaveBeenCalledTimes(1)
        const [payload, reply, chain] = connection.send.mock.calls[0]
        expect<JSONRPCRequestPayload>(payload).toEqual({
          id: request.payload.id,
          jsonrpc: request.payload.jsonrpc,
          method: 'eth_sendRawTransaction',
          params: ['0xsigned']
        })
        expect(chain).toEqual({ type: 'ethereum', id: 10 })
        expect(accounts.trackAutonomousTransaction).not.toHaveBeenCalled()

        const response = { id: payload.id, jsonrpc: payload.jsonrpc, result: '0xhash' }
        reply(response)

        expect(accounts.trackAutonomousTransaction).toHaveBeenCalledWith(address, request, '0xhash')
        expect(respond.mock.calls).toEqual([[response]])
      }
    }
  )
})

describe('#executeAccountTransaction', () => {
  it('broadcasts a reviewed named-account transaction with its signing UI and a fresh RPC id', async () => {
    const reviewed: TransactionData = {
      from: address,
      to: '0x1111111111111111111111111111111111111111',
      chainId: '0xa',
      type: '0x0',
      gasPrice: '0x1',
      gasLimit: '0x5208',
      nonce: '0x2',
      gasFeesSource: GasFeesSource.Dapp
    }
    let ownerActive = true
    const ui: SigningUiContext = {
      owner: { clientType: 'wallet-ui', windowInstanceId: 'executor-review' },
      isOwnerActive: () => ownerActive,
      subscribeOwnerDisposed: () => () => {}
    }
    const signTransaction = createSignTransactionMock()
    signTransaction.mockImplementation((_transaction, reply) => reply(null, '0xsigned'))
    accounts.getFrameAccount.mockReturnValue({ id: address, signTransaction })
    const getNonce = spyOn(provider, 'getNonce').mockImplementation((_transaction, reply) =>
      reply({ id: 1, jsonrpc: '2.0', result: '0x02' })
    )
    connection.send.mockImplementation((payload, reply) =>
      reply({ id: payload.id, jsonrpc: payload.jsonrpc, result: '0xhash' })
    )

    try {
      const result = await provider.executeAccountTransaction(
        address,
        reviewed,
        { gasPrice: '0x2' },
        ui,
        'review-request'
      )
      expect(result).toBe('0xhash')

      const [signedTransaction, , approval] = signTransaction.mock.calls[0]
      expect(signedTransaction).toEqual({ ...reviewed, gasPrice: '0x2' })
      expect(approval).toMatchObject({ requestId: 'review-request', chainId: 10, ui })
      expect(approval?.isActive()).toBe(true)
      ownerActive = false
      expect(approval?.isActive()).toBe(false)
      expect(connection.send).toHaveBeenCalledTimes(1)
      const [payload, , chain] = connection.send.mock.calls[0]
      expect<JSONRPCRequestPayload>(payload).toEqual({
        id: payload.id,
        jsonrpc: '2.0',
        method: 'eth_sendRawTransaction',
        params: ['0xsigned']
      })
      expect(validateUUID(String(payload.id))).toBe(true)
      expect(chain).toEqual({ type: 'ethereum', id: 10 })
      expect(accounts.setTxSigned).not.toHaveBeenCalled()
    } finally {
      getNonce.mockRestore()
    }
  })
})

describe('#signAndSend', () => {
  let tx: TransactionData
  let request: TransactionRequest

  const signAndSend = (cb: Callback<string> = mock()) => provider.signAndSend(request, cb)

  beforeEach(() => {
    tx = { chainId: '0x1', type: '0x0', gasFeesSource: GasFeesSource.Dapp }

    request = {
      handlerId: '99',
      account: '0x1111111111111111111111111111111111111111',
      type: 'transaction',
      origin: 'test',
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_sendTransaction',
        params: [tx],
        _origin: 'test'
      },
      data: tx,
      approvals: [],
      feesUpdatedByUser: false,
      recipientType: 'unknown',
      recognizedActions: [],
      classification: TxClassification.NATIVE_TRANSFER
    }
  })

  it('allows a Fantom transaction with fees over the mainnet hard limit', (done) => {
    // 200 gwei * 10M gas = 2 FTM
    tx.chainId = '0xfa'
    tx.type = '0x0'
    tx.gasPrice = toBeHex(parseUnits('210', 'gwei'))
    tx.gasLimit = addHexPrefix((1e7).toString(16))
    accounts.signTransaction.mockImplementation(() => done())

    signAndSend(done)
  })
  ;[
    ['pre-EIP-1559', '0x0', 'gasPrice'],
    ['post-EIP-1559', '0x2', 'maxFeePerGas']
  ].forEach(([description, type, feeField]) => {
    it(`does not allow a ${description} transaction above the hard limit`, (done) => {
      Object.assign(tx, {
        chainId: '0x1',
        type,
        [feeField]: toBeHex(parseUnits('210', 'gwei')),
        gasLimit: addHexPrefix((1e7).toString(16))
      })
      signAndSend((err) => {
        expect(err?.message).toMatch(/over hard limit/)
        done()
      })
    })
  })

  describe('#fillTransaction', () => {
    beforeEach(() => {
      connection.send.mockImplementationOnce((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
        expect(payload.method).toBe('eth_estimateGas')
        cb({ id: payload.id, jsonrpc: payload.jsonrpc, result: addHexPrefix((150000).toString(16)) })
      })

      setNetworkGas(1, {
        samples: [],
        price: {
          selected: 'standard',
          levels: { slow: '', standard: '', fast: gweiToHex(30), asap: '', custom: '' },
          fees: {
            maxPriorityFeePerGas: gweiToHex(1),
            maxBaseFeePerGas: gweiToHex(8)
          }
        }
      })
    })

    it('should not include an undefined "to" field', (done) => {
      const txJson = {
        chainId: '0x1'
      }

      void provider.fillTransaction(txJson, (err, metadata) => {
        try {
          expect(err).toBeFalsy()
          if (!metadata) {
            throw new Error('Expected transaction metadata')
          }
          const { tx } = metadata
          expect(connection.refreshGasFees).toHaveBeenCalledWith({ type: 'ethereum', id: 1 })
          expect('to' in tx).toBe(false)
          done()
        } catch (e) {
          done(e)
        }
      })
    })
  })

  describe('broadcasting transactions', () => {
    const signedTx = '0x2eca5b929f8a671f0a3c0a7996f83141b2260fdfac62a1da8a8098b326001b99'
    const txHash = '0x6e8b1de115105ceab599b4d99604797b961cfd1f46b85e10f23a81974baae3d5'

    beforeEach(() => {
      accounts.signTransaction.mockImplementation((_tx, cb) => cb(null, signedTx))
      accounts.setTxSigned.mockImplementation((reqId, cb) => {
        expect(reqId).toBe(request.handlerId)
        cb(null)
      })
    })

    it('waits for signed state, retries, and settles only the first broadcast response', () => {
      tx.chainId = '0xa'
      accounts.setTxSigned.mockImplementation(() => {})
      const completed = mock((_error?: Error | null, _value?: string) => {})

      signAndSend(completed)

      expect(connection.send).not.toHaveBeenCalled()
      accounts.setTxSigned.mock.calls[0][1](null)
      expect(connection.send).toHaveBeenCalledTimes(1)
      timers.advanceTimersByTime(1000)
      expect(connection.send).toHaveBeenCalledTimes(2)
      const [payload, reply, chain] = connection.send.mock.calls[0]
      expect<JSONRPCRequestPayload>(payload).toEqual({
        id: request.payload.id,
        jsonrpc: request.payload.jsonrpc,
        method: 'eth_sendRawTransaction',
        params: [signedTx]
      })
      expect(chain).toEqual({ type: 'ethereum', id: 10 })

      connection.send.mock.calls[1][1]({ id: payload.id, jsonrpc: payload.jsonrpc, result: txHash })
      reply({ id: payload.id, jsonrpc: payload.jsonrpc, error: { code: -1, message: 'late response' } })
      timers.advanceTimersByTime(1000)

      expect(connection.send).toHaveBeenCalledTimes(2)
      expect(completed.mock.calls).toEqual([[null, txHash]])
    })

    describe('success', () => {
      beforeEach(() => {
        connection.send.mockImplementation((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
          expect(payload).toEqual(
            expect.objectContaining({
              id: request.payload.id,
              method: 'eth_sendRawTransaction',
              params: [signedTx]
            }) as unknown as RPCRequestPayload
          )

          cb({ id: payload.id, jsonrpc: payload.jsonrpc, result: txHash })
        })
      })

      it('returns a successful broadcast through its lifecycle callback', () => {
        Object.assign(tx, {
          chainId: '0x1',
          gasLimit: '0x5208',
          gasPrice: '0x1',
          nonce: '0x0',
          type: '0x0'
        })
        const lockRequest = mock()
        const signTransaction = accounts.signTransaction
        const sendRequest = connection.send
        accounts.lockRequest = lockRequest
        const completed = mock((_error?: Error | null, _value?: string) => {})

        provider.approveTransactionRequest(request, completed)

        expect(lockRequest.mock.calls.length).toBe(1)
        expect(signTransaction).toHaveBeenCalledTimes(1)
        expect(sendRequest).toHaveBeenCalledTimes(1)
        expect(completed.mock.calls).toEqual([[null, txHash]])
      })
    })

    describe('failure', () => {
      const errorMessage = 'invalid transaction!'

      beforeEach(() => {
        mockConnectionError(errorMessage)
      })

      it('handles a transaction send failure', (done) => {
        Object.assign(tx, { chainId: '0x1' })
        signAndSend((err) => {
          expect(err?.message).toBe(errorMessage)
          done()
        })
      })
    })
  })
})

describe('sendAsync failure settlement', () => {
  it.each([false, true])('settles once when send rejects, callback first: %s', async (callbackFirst) => {
    const response = { id: 1, jsonrpc: '2.0' as const, result: '0x1' }
    const failure = new Error('provider unavailable')
    const send = spyOn(provider, 'send').mockImplementation(
      async (_payload: RPCRequestPayload, respond: (result: RPCResponsePayload) => void) => {
        if (callbackFirst) {
          respond(response)
        }
        throw failure
      }
    )
    const results: Parameters<Callback<RPCResponsePayload>>[] = []
    try {
      provider.sendAsync(
        { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test' },
        (...result: Parameters<Callback<RPCResponsePayload>>) => {
          results.push(result)
        }
      )
      await Promise.resolve()
      expect(results).toEqual(callbackFirst ? [[null, response]] : [[failure]])
    } finally {
      send.mockRestore()
    }
  })
})
