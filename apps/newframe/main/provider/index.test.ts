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

import log from 'electron-log'
import EventEmitter from 'events'
import { parseUnits, toBeHex } from 'ethers'
import { validate as validateUUID } from 'uuid'
import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { randomUUID } from 'node:crypto'

import chainConfig from '../chains/config'
import { gweiToHex } from '../../domain/hex'
import { Type as SignerType } from '../../domain/signer'
import { createAgentPrincipal, createRpcPrincipal } from '../authority'

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

let accountRequests: any = []
let provider: any
const accounts: any = {}
let connection: any
let store: any
let accountRequestHook: ((request: any, respond?: (response: any) => void) => void) | undefined
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
    if (!callback) return false
    this.callbacks.delete(requestId)
    callback(response)
    return true
  }
}

const storeState = () => store.getState()
const setOrigin = (id: string, origin: any) => {
  store.setState((state: any) => {
    state.main.origins[id] = origin
  })
}
const setOrigins = (origins: Record<string, any>) => {
  store.setState((state: any) => {
    state.main.origins = origins
  })
}
const setPermissions = (account: string, permissions: Record<string, any>) => {
  store.setState((state: any) => {
    state.main.permissions[account] = permissions
  })
}
const setNetwork = (id: number, network: any) => {
  store.setState((state: any) => {
    if (network === undefined) delete state.main.networks.ethereum[id]
    else {
      state.main.networks.ethereum[id] = {
        name: `chain-${id}`,
        explorer: '',
        ...network,
        connection: {
          primary: { connected: false, ...(network.connection?.primary || {}) },
          secondary: { connected: false, ...(network.connection?.secondary || {}) }
        }
      }
      state.main.networksMeta.ethereum[id] ||= {
        primaryColor: 'accent1',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18, icon: '' }
      }
    }
  })
}
const setNetworkGas = (id: number, gas: any) => {
  store.setState((state: any) => {
    state.main.networksMeta.ethereum[id] ||= {}
    state.main.networksMeta.ethereum[id].gas = gas
  })
}
const expectQueuedRequestRejection = (sendRequest: (callback: (response: any) => void) => void) =>
  new Promise<void>((resolve, reject) => {
    const callback = mock()
    accountRequestHook = (request, respond) => {
      try {
        expect(respond).toEqual(expect.any(Function))
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

mock.module('../chains', () => {
  const chains = { send: mock(), syncDataEmit: mock(), on: mock(), off: mock(), refreshGasFees: mock() }
  return { default: chains, ...chains }
})
mock.module('../reveal', () => {
  const reveal = {
    resolveEntityType: mock().mockResolvedValue('external')
  }
  return { default: reveal, ...reveal }
})

mock.module('./subscriptions', () => ({
  SubscriptionType: {
    ACCOUNTS: 'accountsChanged',
    ASSETS: 'assetsChanged',
    CHAINS: 'chainsChanged'
  },
  hasSubscriptionPermission: mock()
}))

beforeAll(async () => {
  log.transports.console.level = false

  const connectionModule = (await import('../chains')) as any
  connection = connectionModule.default || connectionModule
  store = (await import('../store')).default as any
  accounts.getAccounts = () => [address]
  accounts.current = () => ({ id: address, getAccounts: () => [address] })
  accounts.get = () => undefined
  accounts.routeRequest = (receivedPrincipal: unknown, req: any, executeAutonomously: any) => {
    expect(receivedPrincipal).toBe(principal)
    store.setState((state: any) => {
      state.main.accounts[req.account] ||= {}
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
  }

  const { Provider } = await import('./index')
  const { createProviderStatePort } = await import('./statePort')
  provider = new Provider({
    accounts,
    chains: connection,
    proxy: new EventEmitter() as any,
    state: createProviderStatePort(store),
    store,
    reveal: { resolveEntityType: mock(async () => 'unknown' as const) },
    requests: requestContinuations
  }) as any
  provider.start()
})

afterAll(() => {
  provider.dispose()
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  timers.useFakeTimers()

  store.setState((state: any) => {
    state.main.accounts = {}
    state.main.balances = {}
    state.main.currentAccount = ''
    state.main.networks.ethereum = {}
    state.main.origins = {}
    state.main.assetRates = {}
  })

  requestContinuations.callbacks.clear()

  const eventTypes = ['accountsChanged', 'chainChanged', 'chainsChanged', 'assetsChanged', 'networkChanged']
  eventTypes.forEach((eventType) => (provider.subscriptions[eventType] = []))

  accountRequests = []
  accountRequestHook = undefined

  connection.send = mock()
  connection.refreshGasFees = mock().mockResolvedValue(undefined)
  connection.connections = {
    ethereum: {
      1: { chainConfig: chainConfig(1, 'london'), primary: { connected: true } },
      5: { chainConfig: chainConfig(5, 'london'), primary: { connected: true } }
    }
  }

  accounts.current = mock(() => ({ id: address, getAccounts: () => [address] }))
  accounts.get = mock((addr) =>
    addr === address ? { id: address, address, lastSignerType: 'ring' } : undefined
  )
  accounts.signTransaction = mock()
  accounts.setTxSigned = mock()
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

  const send = (request: any, cb: any = mock(), requestPrincipal = principal) =>
    provider.send({ ...request, _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087' }, cb, requestPrincipal)
  const sendResult = (request: any, requestPrincipal = principal) =>
    new Promise<any>((resolve) => send(request, resolve, requestPrincipal))

  ;[
    ['unknown', '0x63'],
    ['invalid', 'test']
  ].forEach(([description, chainId]) => {
    it(`returns an error when an ${description} chain is given`, async () => {
      const response = await sendResult({ method: 'eth_testFrame', chainId })
      expect(connection.send).not.toHaveBeenCalled()
      expect(response.error.message).toMatch(/unknown chain/)
      expect(response.result).toBeUndefined()
    })
  })

  it('rejects signing methods that do not carry a trusted transport principal', () => {
    const callback = mock()

    provider.send(
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

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 4100,
          message: 'Wallet action is missing a trusted request source'
        })
      })
    )
    expect(accountRequests).toHaveLength(0)
  })

  describe('#eth_chainId', () => {
    ;[
      ['current', 1],
      ['target', 5]
    ].forEach(([description, chain]) => {
      it(`returns the ${description} chain id from the store`, async () => {
        setNetwork(chain as number, { id: chain, on: true })
        expect((await sendResult({ method: 'eth_chainId', chainId: `0x${chain}` })).result).toBe(`0x${chain}`)
      })
    })

    it('returns an error for a disabled chain', async () => {
      setNetwork(5, { id: 5, on: false })
      const response = await sendResult({ method: 'eth_chainId', chainId: '0x5' })
      expect(response.error.message).toBe('not connected')
      expect(response.result).toBeUndefined()
    })
  })

  describe('#frame_getOriginStatus', () => {
    const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'
    ;[
      ['returns the permitted address', principal, 42161, true, address, ''],
      ['exposes the selected address to internal requests', internalPrincipal, 1, false, '', address],
      ['hides the selected address from external requests', principal, 1, false, '', '']
    ].forEach(([description, source, chainId, permitted, visibleAddress, selectedAddress]) => {
      it(description as string, async () => {
        setOrigin(originId, { name: 'frame.test', chain: { id: chainId, type: 'ethereum' } })
        setPermissions(address, permitted ? { [originId]: { origin: 'frame.test', provider: true } } : {})
        expect((await sendResult({ method: 'frame_getOriginStatus' }, source as any)).result).toEqual({
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

      let subscriptionEvent: any
      provider.once('data:subscription', (payload: any) => {
        subscriptionEvent = payload
      })

      send({ method: 'frame_disconnectOrigin' }, (response: any) => {
        expect(response.error).toBeUndefined()
        expect(response.result.connected).toBe(false)
        expect(response.result.address).toBe('')
        expect(storeState().main.permissions[address][originId]).toBeUndefined()
        expect(storeState().main.origins[originId].session.endedAt).toEqual(expect.any(Number))
        expect(accounts.clearRequestsByOrigin).toHaveBeenCalledWith(address, originId)
        expect(subscriptionEvent.params.subscription).toBe(subscription.id)
        expect(subscriptionEvent.params.result).toEqual([])
        done()
      })
    })
  })

  describe('#wallet_addEthereumChain', () => {
    const sendRequest = (chain: any, cb: any) =>
      send({ method: 'wallet_addEthereumChain', params: [chain] }, cb)
    const chainRequest = (overrides: Record<string, unknown> = {}) => ({
      chainId: '0x1234',
      chainName: 'Bizarro Polygon',
      nativeCurrency: { name: 'New', symbol: 'NEW', decimals: 18 },
      rpcUrls: ['https://rpc.example.com'],
      blockExplorerUrls: ['https://explorer.example.com'],
      ...overrides
    })

    it('should create a request to add the chain', () => {
      const cb = mock()
      sendRequest(chainRequest(), cb)

      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0]).toEqual(
        expect.objectContaining({
          handlerId: expect.any(String),
          type: 'addChain',
          chain: {
            type: 'ethereum',
            id: 4660,
            name: 'Bizarro Polygon',
            symbol: 'NEW',
            nativeCurrencyName: 'New',
            primaryRpc: 'https://rpc.example.com',
            secondaryRpc: undefined,
            explorer: 'https://explorer.example.com'
          }
        })
      )
    })

    it('rejects unsafe RPC and block explorer URLs', () => {
      const rpcResponse = mock()
      const explorerResponse = mock()

      sendRequest(chainRequest({ rpcUrls: ['file:///tmp/rpc'] }), rpcResponse)
      sendRequest(chainRequest({ blockExplorerUrls: ['javascript:alert(1)'] }), explorerResponse)

      expect(rpcResponse.mock.calls[0][0].error.message).toMatch(/invalid rpc url/i)
      expect(explorerResponse.mock.calls[0][0].error.message).toMatch(/invalid block explorer url/i)
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

    it('requires approval to reactivate a chain and ignores requested RPC replacements', () => {
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

      expect(accountRequests).toHaveLength(1)
      const network = storeState().main.networks.ethereum[31337]
      expect(network.on).toBe(false)
      expect(network.connection.primary.on).toBe(false)
      expect(network.connection.primary.custom).toBe('')
      expect(accountRequests[0].chain).not.toHaveProperty('primaryRpc')
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
      expect(response.error.code).toBe(4902)
      expect(accountRequests).toHaveLength(0)
    })
  })

  describe('#wallet_requestPermissions', () => {
    it('returns the requested permissions', async () => {
      const permissions = (
        await sendResult({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }, { eth_signTransaction: {} }]
        })
      ).result
      expect(
        permissions.map(({ parentCapability, date }: any) => [parentCapability, Number.isInteger(date)])
      ).toEqual([
        ['eth_accounts', true],
        ['eth_signTransaction', true]
      ])
    })
  })

  describe('#wallet_watchAsset', () => {
    let request: any

    beforeEach(() => {
      setNetwork(1, { id: 1, on: true })
      store.setState((state: any) => {
        state.main.tokens = { byId: {}, accountTokenIds: {} }
      })

      request = {
        id: 10,
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
        },
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
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
        })
      )
    })

    it('does not add a request for a token that is already added', async () => {
      store.setState((state: any) => {
        const token = request.params.options
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
    ;[
      ['does not exist', undefined],
      ['is disabled', { id: 1, on: false }]
    ].forEach(([description, network]) => {
      it(`rejects a request when the chain ${description}`, async () => {
        setNetwork(1, network)
        expect((await sendResult(request)).error).toMatchObject({
          code: -1,
          message: expect.stringContaining('not connected')
        })
        expect(accountRequests).toHaveLength(0)
      })
    })
    ;[
      ['missing', undefined],
      ['not ERC-20', 'ERC721']
    ].forEach(([description, type]) => {
      it(`rejects a request whose type is ${description}`, async () => {
        request.params.type = type
        expect((await sendResult(request)).error).toMatchObject({
          code: -1,
          message: expect.stringContaining('only ERC-20 tokens are supported')
        })
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request with no token address', async () => {
      delete request.params.options.address
      const { error } = await sendResult(request)
      expect(error.code).toBe(-1)
      expect(error.message).toMatch('tokens must define an address')
      expect(accountRequests).toHaveLength(0)
    })
  })

  describe('#wallet_getEthereumChains', () => {
    it('returns only enabled chains through the provider', async () => {
      store.setState((state: any) => {
        state.main.networks.ethereum = {
          1: { id: 1, name: 'mainnet', explorer: '', on: true, connection: { primary: { connected: true } } },
          137: {
            id: 137,
            name: 'polygon',
            explorer: '',
            on: false,
            connection: { primary: { connected: false } }
          }
        }
        state.main.networksMeta.ethereum = {
          1: {
            primaryColor: 'accent3',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18, icon: 'ethereum' }
          }
        }
      })

      const response = await sendResult({ method: 'wallet_getEthereumChains', id: 14, jsonrpc: '2.0' })
      expect(response).toMatchObject({ id: 14, jsonrpc: '2.0' })
      expect(response.result.map(({ chainId }: any) => chainId)).toEqual([1])
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
      store.setState((state: any) => {
        state.main.accounts[address] = { balances: { lastUpdated: new Date() } }
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
      ;(accounts.current as any).mockReturnValueOnce(undefined)
      const response = await sendResult({ method: 'wallet_getAssets', id: 21, jsonrpc: '2.0' })
      expect(response).toMatchObject({ id: 21, jsonrpc: '2.0' })
      expect(response.error.message).toMatch(/no account selected/i)
      expect(response.result).toBeUndefined()
    })

    it('returns the current account assets through the provider', async () => {
      expect((await sendResult({ method: 'wallet_getAssets' })).result.erc20).toEqual([
        expect.objectContaining(token)
      ])
    })

    it('returns an error while scanning', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      store.setState((state: any) => {
        state.main.accounts[address].balances.lastUpdated = yesterday
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

    let blockResult: any

    beforeEach(() => {
      ;(connection.send as any).mockImplementation((payload: any, res: any, targetChain: any) => {
        expect(targetChain.id).toBe(chain)
        expect(payload.params[0]).toBe(txHash)

        return res({ result: blockResult })
      })
    })

    const maxFeePerGas = `0x${(10e9).toString(16)}`
    ;[
      ['uses maxFeePerGas as gasPrice when absent', { maxFeePerGas, gasPrice: maxFeePerGas }],
      ['maintains an existing gasPrice', { gasPrice: `0x${(8e9).toString(16)}`, maxFeePerGas }]
    ].forEach(([description, result]) => {
      it(description as string, async () => {
        blockResult = result
        expect((await sendResult(request)).result).toEqual(result)
      })
    })
  })

  describe('#eth_sendTransaction', () => {
    let tx: any

    const sendTransaction = (cb: any, chainId?: any) => {
      const payload = {
        jsonrpc: '2.0',
        id: 7,
        method: 'eth_sendTransaction',
        params: [tx]
      }

      if (chainId) (payload as any).chainId = chainId

      provider.send({ ...payload, _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087' }, cb, principal)
    }
    const sendTransactionResult = (chainId?: any) =>
      new Promise<any>((resolve) => sendTransaction(resolve, chainId))

    beforeEach(() => {
      tx = {
        from: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
        to: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
        chainId: '0x1',
        gasLimit: intToHex(21000),
        type: '0x1',
        nonce: '0xa'
      }

      const chainIds = [1, 137]

      chainIds.forEach((chainId) => {
        setNetworkGas(chainId, {
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
      expect(response.error.message).toMatch(/does not match/i)
      expect(response.result).toBeUndefined()
    })

    it('populates the transaction with the request chain id if not provided in the transaction', async () => {
      delete tx.chainId
      await sendTransactionResult('0x89')
      expect(accountRequests[0].data.chainId).toBe('0x89')
    })

    it('maintains transaction chain id if no target chain provided with the request', async () => {
      tx.chainId = '0x89'
      await sendTransactionResult()
      expect(accountRequests[0].data.chainId).toBe('0x89')
    })

    it('switches to a known account matching the transaction from address', async () => {
      const nextAddress = '0x35f9179059a691d8beecf82fe112f7277e018588'
      let currentAddress = address

      tx.from = nextAddress

      accounts.current = mock(() => ({ id: currentAddress, getAccounts: () => [currentAddress] }))
      accounts.get = mock((addr) =>
        addr === nextAddress ? { id: nextAddress, address: nextAddress, lastSignerType: 'ring' } : undefined
      )
      accounts.setSigner = mock((id, cb) => {
        currentAddress = id
        cb(null, { id, address: id, lastSignerType: 'ring' })
      })

      await sendTransactionResult()
      expect(accounts.setSigner).toHaveBeenCalledWith(nextAddress, expect.any(Function))
      expect(accountRequests[0].account).toBe(nextAddress)
      expect(accountRequests[0].data.from.toLowerCase()).toBe(nextAddress)
    })

    it('pads the gas estimate from the network by 50 percent', async () => {
      ;(connection.send as any).mockImplementationOnce((payload: any, cb: any) => {
        expect(payload.method).toBe('eth_estimateGas')
        cb({ result: addHexPrefix((150000).toString(16)) })
      })

      delete tx.gasLimit

      await sendTransactionResult()
      expect(accountRequests[0].data.gasLimit).toBe(addHexPrefix((225000).toString(16)))
    })

    it('publishes required approvals with the initial transaction request', async () => {
      ;(connection.send as any).mockImplementationOnce((_payload: any, cb: any) => {
        cb({ error: { message: 'Unable to estimate gas' } })
      })
      delete tx.gasLimit

      await sendTransactionResult()
      expect(accountRequests[0].approvals).toEqual([
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
      expect(accountRequests[0].data.gasPrice).toBe('0x00')
    })
  })

  describe('#eth_sign', () => {
    const message = 'hello, Ethereum!'
    const hexMessage = addHexPrefix(Buffer.from(message, 'utf-8').toString('hex'))

    it('submits a request to sign a message', () => {
      send({ method: 'eth_sign', params: [address, hexMessage] })

      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toEqual(hexMessage)
    })

    it('releases its response handler when a sign request is rejected', async () => {
      await expectQueuedRequestRejection((callback) =>
        send({ method: 'eth_sign', params: [address, hexMessage] }, callback)
      )
    })

    it('does not submit a request from an account other than the current one', async () => {
      const params = ['0xa4581bfe76201f3aa147cce8e360140582260441', message]
      expect((await sendResult({ method: 'eth_sign', params })).error).toBeTruthy()
    })
  })

  describe('#personal_sign', () => {
    const message = 'hello, Ethereum!'
    const password = 'supersecret'
    const hexMessage = addHexPrefix(Buffer.from(message, 'utf-8').toString('hex'))

    ;[
      ['address first', [address, hexMessage, password], hexMessage],
      ['message first', [hexMessage, address, password], hexMessage],
      [
        '20-byte message first',
        ['0x6672616d652e7368206973206772656174212121', address, password],
        '0x6672616d652e7368206973206772656174212121'
      ]
    ].forEach(([description, params, expectedMessage]) => {
      it(`submits a request with the ${description}`, () => {
        send({ method: 'personal_sign', params })
        expect(accountRequests[0]).toMatchObject({
          handlerId: expect.any(String),
          payload: { params: [address, expectedMessage, password] }
        })
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

    const validRequests = [
      ['eth_signTypedData', typedDataLegacy, SignTypedDataVersion.V1, 'legacy'],
      ['eth_signTypedData', typedData, SignTypedDataVersion.V4, 'eip-712'],
      ['eth_signTypedData_v1', typedDataLegacy, SignTypedDataVersion.V1, 'legacy'],
      ['eth_signTypedData_v3', typedData, SignTypedDataVersion.V3, 'eip-712'],
      ['eth_signTypedData_v4', typedData, SignTypedDataVersion.V4, 'eip-712']
    ].flatMap(([method, data, version, dataDescription]) => [
      { method, params: [address, data], version, dataDescription },
      { method, params: [data, address], version, dataFirst: true, dataDescription }
    ])

    function verifyRequest(version: any, expectedPayload: any) {
      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toStrictEqual(expectedPayload)
      expect(accountRequests[0].typedMessage.version).toBe(version)
      expect(accountRequests[0].typedMessage.data).toStrictEqual(expectedPayload)
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
      ;(accounts.current as any).mockReturnValue({ id: address })
    })

    it('handles typed data as a stringified json param', () => {
      const params = [JSON.stringify(typedData), address]

      send({ method: 'eth_signTypedData', params })

      verifyRequest(SignTypedDataVersion.V4, typedData)
    })
    ;[
      ['without a message', [address, { ...typedData, message: undefined }], 'Typed data missing message'],
      [
        'from an unknown account',
        ['0xa4581bfe76201f3aa147cce8e360140582260441', typedData],
        'Unknown account: 0xa4581bfe76201f3aa147cce8e360140582260441'
      ],
      ['with malformed data', [address, 'test'], 'Malformed typed data']
    ].forEach(([description, params, message]) => {
      it(`does not submit a request ${description}`, async () => {
        expect((await sendResult({ method: 'eth_signTypedData_v3', params })).error).toEqual({
          message,
          code: -1
        })
      })
    })

    it('does not submit a request to the wrong account', async () => {
      ;(accounts.current as any).mockReturnValueOnce({ id: '0xa4581bfe76201f3aa147cce8e360140582260441' })
      expect(
        (await sendResult({ method: 'eth_signTypedData_v3', params: [address, typedData] })).error
      ).toEqual({
        message: 'Sign request is not from currently selected account',
        code: -1
      })
    })

    // these signers only support V4+
    const HardwareSignersSupportingV4Only = [SignerType.Ledger, SignerType.Trezor]

    HardwareSignersSupportingV4Only.forEach((signerType) => {
      it(`does not submit a V3 request to a ${signerType}`, async () => {
        ;(accounts.get as any).mockImplementationOnce((addr: any) => {
          return addr === address ? { id: address, address, lastSignerType: signerType } : {}
        })

        const params = [address, typedData]

        const { error } = await sendResult({ method: 'eth_signTypedData_v3', params })
        expect(error.message).toMatch(new RegExp(signerType, 'i'))
        expect(error.code).toBe(-1)
      })
    })

    it('should submit a V3 request to a Lattice', () => {
      ;(accounts.get as any).mockImplementationOnce((addr: any) => {
        return addr === address ? { id: address, address, lastSignerType: SignerType.Lattice } : {}
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
          (await sendResult({ method: `eth_signTypedData${versionExtension}`, params })).error.message
        ).toBe('received unhandled request')
      })
    })
  })

  describe('subscriptions', () => {
    const eventTypes = ['accountsChanged', 'chainChanged', 'chainsChanged', 'networkChanged']

    describe('#eth_subscribe', () => {
      const subscribe = (eventType: any) =>
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
      const unsubscribe = (id: any) =>
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

        provider.subscriptions.accountsChanged = ['0xtest1']
        provider.subscriptions.chainChanged = ['0xtest2']
        provider.subscriptions.chainsChanged = ['0xtest2']
        provider.subscriptions.networkChanged = ['0xtest3']

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
  it('does not broadcast a transaction when its agent session is revoked during signing', () => {
    let active = true
    const agentPrincipal = createAgentPrincipal({
      sessionId: 'agent-session',
      accountId: address,
      expiresAt: Date.now() + 60_000,
      isActive: () => active
    })
    const signTransaction = mock()
    const account = { id: address, signTransaction }
    const request = {
      payload: {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: []
      },
      data: {
        chainId: '0x1',
        type: '0x0',
        gasPrice: '0x1',
        gasLimit: '0x5208',
        nonce: '0x0'
      }
    }
    const respond = mock()

    provider.executeAgentTransaction(account, request, agentPrincipal, respond)
    expect(signTransaction).toHaveBeenCalledTimes(1)

    active = false
    signTransaction.mock.calls[0][1](null, '0xsigned')

    expect(connection.send).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Agent session is revoked or unavailable' })
      })
    )
  })
})

describe('#signAndSend', () => {
  let tx = {},
    request = {}

  const signAndSend = (cb: any = mock()) => provider.signAndSend(request, cb)

  beforeEach(() => {
    tx = {}

    request = {
      handlerId: 99,
      payload: { jsonrpc: '2.0', id: 2, method: 'eth_sendTransaction' },
      data: tx
    }
  })

  it('allows a Fantom transaction with fees over the mainnet hard limit', (done) => {
    // 200 gwei * 10M gas = 2 FTM
    ;(tx as any).chainId = '0xfa'
    ;(tx as any).type = '0x0'
    ;(tx as any).gasPrice = toBeHex(parseUnits('210', 'gwei'))
    ;(tx as any).gasLimit = addHexPrefix((1e7).toString(16))
    ;(accounts.signTransaction as any).mockImplementation(() => done())

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
      signAndSend((err: any) => {
        expect(err.message).toMatch(/over hard limit/)
        done()
      })
    })
  })

  describe('#fillTransaction', () => {
    beforeEach(() => {
      ;(connection.send as any).mockImplementationOnce((payload: any, cb: any) => {
        expect(payload.method).toBe('eth_estimateGas')
        cb({ result: addHexPrefix((150000).toString(16)) })
      })

      setNetworkGas(1, {
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

      provider.fillTransaction(txJson, (err: any, { tx }: any) => {
        try {
          expect(err).toBeFalsy()
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
      ;(accounts.signTransaction as any).mockImplementation((_: any, cb: any) => cb(null, signedTx))
      ;(accounts.setTxSigned as any).mockImplementation((reqId: any, cb: any) => {
        expect(reqId).toBe((request as any).handlerId)
        cb()
      })
    })

    describe('success', () => {
      beforeEach(() => {
        ;(connection.send as any).mockImplementation((payload: any, cb: any) => {
          expect(payload).toEqual(
            expect.objectContaining({
              id: (request as any).payload.id,
              method: 'eth_sendRawTransaction',
              params: [signedTx]
            })
          )

          cb({ result: txHash })
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
        accounts.lockRequest = mock()
        const completed = mock()

        provider.approveTransactionRequest(request, completed)

        expect(accounts.lockRequest.mock.calls.length).toBe(1)
        expect(accounts.signTransaction.mock.calls.length).toBe(1)
        expect(connection.send.mock.calls.length).toBe(1)
        expect(completed.mock.calls).toEqual([[null, txHash]])
      })
    })

    describe('failure', () => {
      const errorMessage = 'invalid transaction!'

      beforeEach(() => {
        mockConnectionError(errorMessage)
      })

      it('handles a transaction send failure', (done) => {
        signAndSend((err: any) => {
          expect(err.message).toBe(errorMessage)
          done()
        })
      })
    })
  })
})
