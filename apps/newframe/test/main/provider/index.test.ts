import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest as timers,
  mock
} from 'bun:test'

import log from 'electron-log'
import { parseUnits, toBeHex } from 'ethers'
import { validate as validateUUID } from 'uuid'
import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import chainConfig from '../../../main/chains/config'
import { gweiToHex } from '../../../resources/utils'
import { Type as SignerType } from '../../../resources/domain/signer'
import { NATIVE_CURRENCY } from '../../../resources/constants'
import { createAgentPrincipal, createRpcPrincipal } from '../../../main/authority'

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
let accounts: any
let connection: any
let store: any
let hasSubscriptionPermission: any
let accountRequestHook: ((request: any, respond?: (response: any) => void) => void) | undefined

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
const setNetworks = (networks: Record<number, any>) => {
  store.setState((state: any) => {
    state.main.networks.ethereum = networks
  })
}
const setNetworkGas = (id: number, gas: any) => {
  store.setState((state: any) => {
    state.main.networksMeta.ethereum[id] ||= {}
    state.main.networksMeta.ethereum[id].gas = gas
  })
}
const markRequestMonitoring = (request: any) => {
  store.setState((state: any) => {
    state.main.accounts[request.account].requests[request.handlerId].mode = 'monitor'
  })
}

const expectQueuedRequestRejection = (
  sendRequest: (callback: (response: any) => void) => void,
  done: (error?: unknown) => void
) => {
  const callback = mock()

  accountRequestHook = (request, respond) => {
    try {
      expect(respond).toEqual(expect.any(Function))
      expect(provider.handlers[request.handlerId]).toEqual(expect.any(Function))

      const rejection = {
        id: request.payload.id,
        jsonrpc: request.payload.jsonrpc,
        error: { code: 4001, message: 'User rejected the request' }
      }
      respond?.(rejection)
      respond?.(rejection)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(rejection)
      expect(provider.handlers[request.handlerId]).toBeUndefined()
      done()
    } catch (error) {
      done(error)
    }
  }

  sendRequest(callback)
}

mock.module('../../../main/chains', () => {
  const chains = { send: mock(), syncDataEmit: mock(), on: mock(), refreshGasFees: mock() }
  return { default: chains, ...chains }
})
mock.module('../../../main/accounts', () => {
  const accounts = {}
  return { default: accounts, ...accounts }
})
mock.module('../../../main/reveal', () => {
  const reveal = {
    resolveEntityType: mock().mockResolvedValue('external')
  }
  return { default: reveal, ...reveal }
})

mock.module('../../../main/provider/subscriptions', () => ({
  SubscriptionType: {
    ACCOUNTS: 'accountsChanged',
    ASSETS: 'assetsChanged',
    CHAINS: 'chainsChanged'
  },
  hasSubscriptionPermission: mock()
}))

beforeAll(async () => {
  log.transports.console.level = false

  provider = (await import('../../../main/provider')).default as any
  const accountsModule = (await import('../../../main/accounts')) as any
  const connectionModule = (await import('../../../main/chains')) as any
  accounts = accountsModule.default || accountsModule
  connection = connectionModule.default || connectionModule
  store = (await import('../../../main/store')).default as any
  ;({ hasSubscriptionPermission } = await import('../../../main/provider/subscriptions'))

  accounts.getAccounts = () => [address]
  accounts.routeRequest = (receivedPrincipal: unknown, req: any, res: any) => {
    expect(receivedPrincipal).toBe(principal)
    store.setState((state: any) => {
      state.main.accounts[req.account] ||= {}
      state.main.accounts[req.account].requests = { [req.handlerId]: req }
    })
    accountRequests.push(req)
    if (accountRequestHook) {
      const hook = accountRequestHook
      accountRequestHook = undefined
      hook(req, res)
    } else if (res) {
      res()
    }
  }
})

afterAll(() => {
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
    state.main.rates = {}
  })

  provider.handlers = {}

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

describe('#send', () => {
  beforeEach(() => {
    setOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087', {
      chain: { id: 1, type: 'ethereum', on: true }
    })
  })

  const send = (request: any, cb: any = mock(), requestPrincipal = principal) =>
    provider.send({ ...request, _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087' }, cb, requestPrincipal)

  it('passes the given target chain to the connection', () => {
    connection.connections.ethereum[10] = {
      chainConfig: { hardfork: 'london', chainId: 10 },
      primary: { connected: true }
    }

    const request = { method: 'eth_testFrame' }

    send({ ...request, chainId: '0xa' })

    expect(connection.send).toHaveBeenCalledWith(request, expect.any(Function), { type: 'ethereum', id: 10 })
  })

  it('passes the default target chain to the connection when none is given', () => {
    const request = { method: 'eth_testFrame' }

    send(request)

    expect(connection.send).toHaveBeenCalledWith(request, expect.any(Function), {
      type: 'ethereum',
      id: 1,
      on: true
    })
  })

  it('returns an error when an unknown chain is given', (done) => {
    const request = { method: 'eth_testFrame', chainId: '0x63' }

    send(request, (response: any) => {
      expect(connection.send).not.toHaveBeenCalled()
      expect(response.error.message).toMatch(/unknown chain/)
      expect(response.result).toBe(undefined)
      done()
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

  it('returns an error when an invalid chain is given', (done) => {
    const request = { method: 'eth_testFrame', chainId: 'test' }

    send(request, (response: any) => {
      expect(connection.send).not.toHaveBeenCalled()
      expect(response.error.message).toMatch(/unknown chain/)
      expect(response.result).toBe(undefined)
      done()
    })
  })

  describe('#eth_chainId', () => {
    it('returns the current chain id from the store', () => {
      setNetwork(1, { id: 1, on: true })

      send({ method: 'eth_chainId', chainId: '0x1' }, (response: any) => {
        expect(response.result).toBe('0x1')
      })
    })

    it('returns a chain id from the target chain', () => {
      setNetwork(5, { id: 5, on: true })

      send({ method: 'eth_chainId', chainId: '0x5' }, (response: any) => {
        expect(response.result).toBe('0x5')
      })
    })

    it('returns an error for a disabled chain', () => {
      setNetwork(5, { id: 5, on: false })

      send({ method: 'eth_chainId', chainId: '0x5' }, (response: any) => {
        expect(response.error.message).toBe('not connected')
        expect(response.result).toBeUndefined()
      })
    })
  })

  describe('#frame_getOriginStatus', () => {
    it('returns connected origin status with the selected address when permission is granted', (done) => {
      const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'

      setOrigin(originId, {
        name: 'frame.test',
        chain: { id: 42161, type: 'ethereum' }
      })
      setPermissions(address, {
        [originId]: {
          origin: 'frame.test',
          provider: true
        }
      })

      send({ method: 'frame_getOriginStatus' }, (response: any) => {
        expect(response.error).toBeUndefined()
        expect(response.result).toEqual({
          originId,
          origin: 'frame.test',
          connected: true,
          address,
          selectedAddress: '',
          chainId: '0xa4b1'
        })
        done()
      })
    })

    it('returns the selected address to internal status requests when no permission is attached', (done) => {
      const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'

      setOrigin(originId, {
        name: 'frame.test',
        chain: { id: 1, type: 'ethereum' }
      })
      setPermissions(address, {})

      send(
        { method: 'frame_getOriginStatus' },
        (response: any) => {
          expect(response.error).toBeUndefined()
          expect(response.result).toEqual({
            originId,
            origin: 'frame.test',
            connected: false,
            address: '',
            selectedAddress: address,
            chainId: '0x1'
          })
          done()
        },
        internalPrincipal
      )
    })

    it('does not expose the selected address to non-internal status requests when no permission is attached', (done) => {
      const originId = '8073729a-5e59-53b7-9e69-5d9bcff94087'

      setOrigin(originId, {
        name: 'frame.test',
        chain: { id: 1, type: 'ethereum' }
      })
      setPermissions(address, {})

      send({ method: 'frame_getOriginStatus' }, (response: any) => {
        expect(response.error).toBeUndefined()
        expect(response.result).toEqual({
          originId,
          origin: 'frame.test',
          connected: false,
          address: '',
          selectedAddress: '',
          chainId: '0x1'
        })
        done()
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

    it('rejects a request with no chain id', (done) => {
      const cb = (response: any) => {
        expect(response.error.message).toMatch(/missing chainid/i)
        expect(response.result).toBeUndefined()
        done()
      }

      sendRequest({ chainName: 'Rinkeby', nativeCurrency: { symbol: 'rETH' } }, cb)
    })

    it('rejects a request with an invalid chain id', (done) => {
      const cb = (response: any) => {
        expect(response.error.message).toMatch(/invalid chain id/i)
        expect(response.result).toBeUndefined()
        done()
      }

      sendRequest({ chainId: 'test', chainName: 'Rinkeby', nativeCurrency: { symbol: 'rETH' } }, cb)
    })

    it('rejects a request with no chain name', (done) => {
      const cb = (response: any) => {
        expect(response.error.message).toMatch(/missing chainname/i)
        expect(response.result).toBeUndefined()
        done()
      }

      sendRequest({ chainId: '0x5', nativeCurrency: { symbol: 'gETH' } }, cb)
    })

    it('rejects a request with no native currency', (done) => {
      const cb = (response: any) => {
        expect(response.error.message).toMatch(/invalid nativecurrency/i)
        expect(response.result).toBeUndefined()
        done()
      }

      sendRequest({ chainId: '0xaa36a7', chainName: 'Sepolia' }, cb)
    })

    it('should create a request to add the chain', (done) => {
      const cb = () => {
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

        done()
      }

      sendRequest(
        {
          chainId: '0x1234', // A 0x-prefixed hexadecimal string
          chainName: 'Bizarro Polygon',
          nativeCurrency: {
            name: 'New',
            symbol: 'NEW', // 2-6 characters long
            decimals: 18
          },
          rpcUrls: ['https://rpc.example.com'],
          blockExplorerUrls: ['https://explorer.example.com']
        },
        cb
      )
    })

    it('releases its response handler when an add-chain request is rejected', (done) => {
      expectQueuedRequestRejection(
        (callback) =>
          sendRequest(
            {
              chainId: '0x1234',
              chainName: 'Bizarro Polygon',
              nativeCurrency: { name: 'New', symbol: 'NEW', decimals: 18 },
              rpcUrls: ['https://rpc.example.com'],
              blockExplorerUrls: ['https://explorer.example.com']
            },
            callback
          ),
        done
      )
    })

    it('rejects unsafe RPC and block explorer URLs', () => {
      const request = {
        chainId: '0x1234',
        chainName: 'Unsafe chain',
        nativeCurrency: { name: 'Unsafe', symbol: 'BAD', decimals: 18 }
      }
      const rpcResponse = mock()
      const explorerResponse = mock()

      sendRequest({ ...request, rpcUrls: ['file:///tmp/rpc'] }, rpcResponse)
      sendRequest(
        {
          ...request,
          rpcUrls: ['https://rpc.example.com'],
          blockExplorerUrls: ['javascript:alert(1)']
        },
        explorerResponse
      )

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
      storeState().switchOriginChain.mockImplementation(() => undefined)

      sendRequest(
        {
          chainId: '0x1', // A 0x-prefixed hexadecimal string
          chainName: 'Mainnet',
          nativeCurrency: {
            symbol: 'ETH'
          },
          rpcUrls: ['https://attacker.example.com']
        },
        mock()
      )

      expect(accountRequests).toHaveLength(0)
      expect(storeState().switchOriginChain).toHaveBeenCalledWith(
        '8073729a-5e59-53b7-9e69-5d9bcff94087',
        1,
        'ethereum'
      )
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
        {
          chainId: '0x7a69',
          chainName: 'Newframe Local Anvil',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: ['https://attacker.example.com']
        },
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
    it('switches an origin to an existing chain without prompting', (done) => {
      setNetwork(1, { id: 1, on: true })
      setOrigins({
        '8073729a-5e59-53b7-9e69-5d9bcff94087': { chain: { id: 42161, type: 'ethereum' } }
      })
      storeState().switchOriginChain.mockImplementation(() => undefined)

      send(
        {
          method: 'wallet_switchEthereumChain',
          params: [
            {
              chainId: '0x1'
            }
          ],
          _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
        },
        () => {
          expect(accountRequests).toHaveLength(0)
          expect(storeState().switchOriginChain).toHaveBeenCalledWith(
            '8073729a-5e59-53b7-9e69-5d9bcff94087',
            1,
            'ethereum'
          )
          done()
        }
      )
    })

    it('should reject with the correct error if the chain does not exist in the store', (done) => {
      send(
        {
          method: 'wallet_switchEthereumChain',
          params: [
            {
              chainId: '0x1234'
            }
          ],
          _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
        },
        (response: any) => {
          try {
            expect(response.error.code).toBe(4902)
            expect(accountRequests).toHaveLength(0)
            done()
          } catch (e) {
            done(e)
          }
        }
      )
    })
  })

  describe('#wallet_getPermissions', () => {
    it('returns all allowed permissions', (done) => {
      const request = {
        method: 'wallet_getPermissions',
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
      }

      send(request, (response: any) => {
        try {
          expect(response.error).toBe(undefined)

          const permissions = response.result
          expect(permissions).toHaveLength(16)
          expect(permissions.map((p: any) => p.parentCapability)).toEqual(
            expect.arrayContaining([
              'eth_coinbase',
              'eth_accounts',
              'eth_requestAccounts',
              'eth_sendTransaction',
              'eth_sendRawTransaction',
              'personal_sign',
              'personal_ecRecover',
              'eth_sign',
              'eth_signTypedData',
              'eth_signTypedData_v1',
              'eth_signTypedData_v3',
              'eth_signTypedData_v4',
              'wallet_addEthereumChain',
              'wallet_getEthereumChains',
              'wallet_getAssets',
              'wallet_watchAsset'
            ])
          )

          done()
        } catch (e) {
          done(e)
        }
      })
    })
  })

  describe('#wallet_requestPermissions', () => {
    it('returns the requested permissions', (done) => {
      const request = {
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }, { eth_signTransaction: {} }],
        _origin: '8073729a-5e59-53b7-9e69-5d9bcff94087'
      }

      send(request, (response: any) => {
        try {
          expect(response.error).toBe(undefined)

          const permissions = response.result
          expect(permissions).toHaveLength(2)
          expect(permissions[0].parentCapability).toBe('eth_accounts')
          expect(Number.isInteger(permissions[0].date)).toBe(true)
          expect(permissions[1].parentCapability).toBe('eth_signTransaction')
          expect(Number.isInteger(permissions[1].date)).toBe(true)
          done()
        } catch (e) {
          done(e)
        }
      })
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
      send(request, () => {
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
    })

    it('releases its response handler when an add-token request is rejected', (done) => {
      expectQueuedRequestRejection((callback) => send(request, callback), done)
    })

    it('does not add a request for a token that is already added', () => {
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

      send(request, ({ result }: any) => {
        expect(result).toBe(true)
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request when the chain does not exist', () => {
      setNetwork(1, undefined)

      send(request, ({ error }: any) => {
        expect(error.code).toBe(-1)
        expect(error.message).toMatch('not connected')
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request when the chain is disabled', () => {
      setNetwork(1, { id: 1, on: false })

      send(request, ({ error }: any) => {
        expect(error.code).toBe(-1)
        expect(error.message).toMatch('not connected')
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request with no type', () => {
      delete request.params.type

      send(request, ({ error }: any) => {
        expect(error.code).toBe(-1)
        expect(error.message).toMatch('only ERC-20 tokens are supported')
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request with for a non-ERC-20 token', () => {
      request.params.type = 'ERC721'

      send(request, ({ error }: any) => {
        expect(error.code).toBe(-1)
        expect(error.message).toMatch('only ERC-20 tokens are supported')
        expect(accountRequests).toHaveLength(0)
      })
    })

    it('rejects a request with no token address', () => {
      delete request.params.options.address

      send(request, ({ error }: any) => {
        expect(error.code).toBe(-1)
        expect(error.message).toMatch('tokens must define an address')
        expect(accountRequests).toHaveLength(0)
      })
    })
  })

  describe('#wallet_getEthereumChains', () => {
    beforeEach(() => {
      store.setState((state: any) => {
        state.main.networksMeta.ethereum = {
          1: {
            primaryColor: 'accent3',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18,
              icon: 'ethereum'
            }
          },
          137: {
            primaryColor: 'accent7',
            nativeCurrency: {
              name: 'Matic',
              symbol: 'MATIC',
              decimals: 18,
              icon: 'matic'
            }
          }
        }
      })
    })

    it('returns a list of enabled chains', () => {
      setNetworks({
        137: {
          name: 'polygon',
          id: 137,
          explorer: 'https://polygonscan.com',
          connection: { primary: { connected: true }, secondary: { connected: false } },
          on: true
        },
        1: {
          name: 'mainnet',
          id: 1,
          explorer: 'https://etherscan.io',
          connection: { primary: { connected: true }, secondary: { connected: false } },
          on: true
        }
      })

      send({ method: 'wallet_getEthereumChains', id: 14, jsonrpc: '2.0' }, (response: any) => {
        expect(response.error).toBe(undefined)
        expect(response.id).toBe(14)
        expect(response.jsonrpc).toBe('2.0')
        expect(response.result).toStrictEqual([
          {
            name: 'mainnet',
            chainId: 1,
            networkId: 1,
            icon: [{ url: 'ethereum' }],
            explorers: [{ url: 'https://etherscan.io' }],
            external: {
              wallet: {
                colors: [{ r: 255, g: 0, b: 174, hex: '#ff00ae' }]
              }
            },
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18
            },
            connected: true
          },
          {
            name: 'polygon',
            chainId: 137,
            networkId: 137,
            icon: [{ url: 'matic' }],
            explorers: [{ url: 'https://polygonscan.com' }],
            external: {
              wallet: {
                colors: [{ r: 62, g: 173, b: 241, hex: '#3eadf1' }]
              }
            },
            nativeCurrency: {
              name: 'Matic',
              symbol: 'MATIC',
              decimals: 18
            },
            connected: true
          }
        ])
      })
    })

    it('does not return disabled chains', () => {
      setNetworks({
        137: {
          name: 'polygon',
          id: 137,
          explorer: 'https://polygonscan.com',
          connection: { primary: { connected: false }, secondary: { connected: false } },
          on: false
        },
        1: {
          name: 'mainnet',
          id: 1,
          explorer: 'https://etherscan.io',
          connection: { primary: { connected: true }, secondary: { connected: false } },
          on: true
        }
      })

      send({ method: 'wallet_getEthereumChains', id: 14, jsonrpc: '2.0' }, (response: any) => {
        expect(response.result).toStrictEqual([
          {
            name: 'mainnet',
            chainId: 1,
            networkId: 1,
            icon: [{ url: 'ethereum' }],
            explorers: [{ url: 'https://etherscan.io' }],
            external: {
              wallet: { colors: [{ r: 255, b: 174, g: 0, hex: '#ff00ae' }] }
            },
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18
            },
            connected: true
          }
        ])
      })
    })
  })

  describe('#wallet_getAssets', () => {
    const balances = [
      {
        address: '0x3472a5a71965499acd81997a54bba8d852c6e53d',
        chainId: 137,
        name: 'Polygon Badger',
        symbol: 'BADGER',
        balance: '0x1605d9ee98627100000',
        decimals: 18,
        displayBalance: '6500'
      },
      {
        address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
        chainId: 1,
        name: 'Olympus DAO',
        symbol: 'OHM',
        balance: '0xd14d13208',
        decimals: 9,
        displayBalance: '56.183829'
      },
      {
        address: '0x0000000000000000000000000000000000000000',
        chainId: 42161,
        name: 'Ether',
        symbol: 'AETH',
        balance: '0xd8f8753a603f70000',
        decimals: 18,
        displayBalance: '250.15'
      }
    ]

    beforeEach(() => {
      store.setState((state: any) => {
        state.main.accounts[address] = { balances: { lastUpdated: new Date() } }
        state.main.balances[address] = balances
        balances
          .filter((balance) => balance.address !== NATIVE_CURRENCY)
          .forEach((balance) => {
            state.main.tokens.byId[`${balance.chainId}:${balance.address}`] = {
              address: balance.address,
              chainId: balance.chainId,
              decimals: balance.decimals,
              name: balance.name,
              symbol: balance.symbol,
              custom: false,
              curated: false,
              sources: ['onchain'],
              updatedAt: 0
            }
          })
        state.main.networksMeta.ethereum[42161] = {
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18, icon: '' }
        }
      })
    })

    it('returns an error if no account is selected', (done) => {
      ;(accounts.current as any).mockReturnValueOnce(undefined)

      send({ method: 'wallet_getAssets', id: 21, jsonrpc: '2.0' }, (response: any) => {
        expect(response.id).toBe(21)
        expect(response.jsonrpc).toBe('2.0')
        expect(response.result).toBe(undefined)
        expect(response.error.message.toLowerCase()).toMatch(/no account selected/)
        done()
      })
    })

    it('returns native currencies from all chains', (done) => {
      send({ method: 'wallet_getAssets' }, (response: any) => {
        expect(response.error).toBe(undefined)
        expect(response.result.nativeCurrency).toHaveLength(1)

        expect(response.result.nativeCurrency[0]).toEqual(
          expect.objectContaining({
            address: balances[2].address,
            balance: balances[2].balance,
            chainId: balances[2].chainId,
            decimals: 18,
            displayBalance: balances[2].displayBalance,
            name: 'Ether',
            symbol: 'ETH'
          })
        )

        done()
      })
    })

    it('returns erc20 tokens from all chains', (done) => {
      send({ method: 'wallet_getAssets' }, (response: any) => {
        expect(response.error).toBe(undefined)
        expect(response.result.erc20).toHaveLength(2)

        expect(response.result.erc20[0]).toEqual(expect.objectContaining(balances[0]))
        expect(response.result.erc20[1]).toEqual(expect.objectContaining(balances[1]))

        done()
      })
    })

    it('returns an error while scanning', (done) => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      store.setState((state: any) => {
        state.main.accounts[address].balances.lastUpdated = yesterday
      })

      send({ method: 'wallet_getAssets', id: 51, jsonrpc: '2.0' }, (response: any) => {
        expect(response.id).toBe(51)
        expect(response.jsonrpc).toBe('2.0')
        expect(response.result).toBe(undefined)
        expect(response.error.code).toBe(5901)
        done()
      })
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

    it('returns the response from the connection', (done) => {
      blockResult = {
        blockHash: '0xc1b0227f0721a05357b2b417e3872c5f6f01da209422013fe66ee291527fb123',
        blockNumber: '0xc80d08'
      }

      send(request, (response: any) => {
        expect(response.result.blockHash).toBe(
          '0xc1b0227f0721a05357b2b417e3872c5f6f01da209422013fe66ee291527fb123'
        )
        expect(response.result.blockNumber).toBe('0xc80d08')
        done()
      })
    })

    it('uses maxFeePerGas as the gasPrice if one is not defined', (done) => {
      const fee = `0x${(10e9).toString(16)}`

      blockResult = {
        maxFeePerGas: fee
      }

      send(request, (response: any) => {
        expect(response.result.gasPrice).toBe(fee)
        expect(response.result.maxFeePerGas).toBe(fee)
        done()
      })
    })

    it('maintains the gasPrice if maxFeePerGas exists', (done) => {
      const gasPrice = `0x${(8e9).toString(16)}`
      const maxFeePerGas = `0x${(10e9).toString(16)}`

      blockResult = {
        gasPrice,
        maxFeePerGas
      }

      send(request, (response: any) => {
        expect(response.result.gasPrice).toBe(gasPrice)
        expect(response.result.maxFeePerGas).toBe(maxFeePerGas)
        done()
      })
    })

    it('returns a response with no result attribute', (done) => {
      mockConnectionError('no transaction!')

      send(request, (response: any) => {
        expect(response.error.message).toBe('no transaction!')
        done()
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

    it('releases its response handler when a transaction request is rejected', (done) => {
      expectQueuedRequestRejection((callback) => sendTransaction(callback), done)
    })

    it('rejects a transaction with a mismatched chain id', (done) => {
      sendTransaction((response: any) => {
        try {
          expect(response.result).toBe(undefined)
          expect(response.error.message.toLowerCase()).toMatch(/does not match/)
          done()
        } catch (e) {
          done(e)
        }
      }, '0x5')
    })

    it('populates the transaction with the request chain id if not provided in the transaction', (done) => {
      delete tx.chainId

      sendTransaction(() => {
        try {
          const initialRequest = accountRequests[0]
          expect(initialRequest.data.chainId).toBe('0x89')
          done()
        } catch (e) {
          done(e)
        }
      }, '0x89')
    })

    it('maintains transaction chain id if no target chain provided with the request', (done) => {
      tx.chainId = '0x89'

      sendTransaction(() => {
        try {
          const initialRequest = accountRequests[0]
          expect(initialRequest.data.chainId).toBe('0x89')
          done()
        } catch (e) {
          done(e)
        }
      })
    })

    it('switches to a known account matching the transaction from address', (done) => {
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

      sendTransaction(() => {
        try {
          expect(accounts.setSigner).toHaveBeenCalledWith(nextAddress, expect.any(Function))
          expect(accountRequests[0].account).toBe(nextAddress)
          expect(accountRequests[0].data.from.toLowerCase()).toBe(nextAddress)
          done()
        } catch (e) {
          done(e)
        }
      })
    })

    it('pads the gas estimate from the network by 50 percent', (done) => {
      ;(connection.send as any).mockImplementationOnce((payload: any, cb: any) => {
        expect(payload.method).toBe('eth_estimateGas')
        cb({ result: addHexPrefix((150000).toString(16)) })
      })

      delete tx.gasLimit

      sendTransaction(() => {
        try {
          const initialRequest = accountRequests[0]
          expect(initialRequest.data.gasLimit).toBe(addHexPrefix((225000).toString(16)))
          done()
        } catch (e) {
          done(e)
        }
      })
    })

    it('publishes required approvals with the initial transaction request', (done) => {
      ;(connection.send as any).mockImplementationOnce((_payload: any, cb: any) => {
        cb({ error: { message: 'Unable to estimate gas' } })
      })
      delete tx.gasLimit

      sendTransaction(() => {
        try {
          expect(accountRequests[0].approvals).toEqual([
            {
              type: 'approveGasLimit',
              data: { message: 'Unable to estimate gas', gasLimit: '0x00' },
              approved: false
            }
          ])
          done()
        } catch (error) {
          done(error)
        }
      })
    })

    it('uses gasPrice from input params for legacy transactions', (done) => {
      tx.gasPrice = '0x00'

      sendTransaction(() => {
        try {
          const initialRequest = accountRequests[0]
          expect(initialRequest.data.gasPrice).toBe('0x00')
          done()
        } catch (e) {
          done(e)
        }
      })
    })

    describe('replacing gas fees', () => {
      it('adds a 10% gas buffer when replacing a legacy transaction', (done) => {
        tx.type = '0x0'
        tx.chainId = addHexPrefix((137).toString(16))

        try {
          sendTransaction(() => {
            const initialRequest = accountRequests[0]
            const initialPrice = initialRequest.data.gasPrice

            expect(initialPrice).toBe(gweiToHex(30))
            expect(initialRequest.feesUpdatedByUser).toBeFalsy()

            markRequestMonitoring(initialRequest)

            sendTransaction(() => {
              const replacementRequest = accountRequests[1]
              const bumpedPrice = Math.ceil(initialPrice * 1.1)
              expect(replacementRequest.data.gasPrice).toBe(intToHex(bumpedPrice))
              expect(replacementRequest.feesUpdatedByUser).toBe(false)
              done()
            })
          })
        } catch (e) {
          done(e)
        }
      })

      it('does not add a buffer to replacement legacy transactions if the current gas price is already higher', (done) => {
        tx.type = '0x0'
        tx.chainId = addHexPrefix((137).toString(16))

        try {
          sendTransaction(() => {
            const initialRequest = accountRequests[0]
            const initialPrice = initialRequest.data.gasPrice

            expect(initialPrice).toBe(gweiToHex(30))
            expect(initialRequest.feesUpdatedByUser).toBeFalsy()

            markRequestMonitoring(initialRequest)

            setNetworkGas(137, {
              price: {
                selected: 'standard',
                levels: { slow: '', standard: '', fast: gweiToHex(40), asap: '', custom: '' },
                fees: {
                  maxPriorityFeePerGas: gweiToHex(1),
                  maxBaseFeePerGas: gweiToHex(8)
                }
              }
            })

            sendTransaction(() => {
              const replacementRequest = accountRequests[1]
              expect(replacementRequest.data.gasPrice).toBe(gweiToHex(40))
              expect(replacementRequest.feesUpdatedByUser).toBeFalsy()
              done()
            })
          })
        } catch (e) {
          done(e)
        }
      })

      it('adds a 10% gas buffer when replacing an EIP-1559 transaction', (done) => {
        tx.type = '0x2'
        tx.chainId = addHexPrefix((1).toString(16))

        try {
          sendTransaction(() => {
            const initialRequest = accountRequests[0]
            const initialTip = initialRequest.data.maxPriorityFeePerGas
            const initialMax = initialRequest.data.maxFeePerGas

            expect(initialTip).toBe(gweiToHex(1))
            expect(initialMax).toBe(gweiToHex(9))
            expect(initialRequest.feesUpdatedByUser).toBeFalsy()

            markRequestMonitoring(initialRequest)

            sendTransaction(() => {
              const replacementRequest = accountRequests[1]
              const bumpedFee = Math.ceil(initialTip * 1.1)
              const bumpedBase = Math.ceil((initialMax - initialTip) * 1.1)
              const bumpedMax = bumpedFee + bumpedBase

              expect(replacementRequest.data.maxPriorityFeePerGas).toBe(intToHex(bumpedFee))
              expect(replacementRequest.data.maxFeePerGas).toBe(intToHex(bumpedMax))
              expect(replacementRequest.feesUpdatedByUser).toBe(false)
              done()
            })
          })
        } catch (e) {
          done(e)
        }
      })

      it('buffers only the priority fee for replacement EIP-1559 transactions if the current base price is high enough for replacement', (done) => {
        tx.type = '0x2'
        tx.chainId = addHexPrefix((1).toString(16))

        try {
          sendTransaction(() => {
            const initialRequest = accountRequests[0]
            const initialTip = initialRequest.data.maxPriorityFeePerGas
            const initialMax = initialRequest.data.maxFeePerGas

            expect(initialTip).toBe(gweiToHex(1))
            expect(initialMax).toBe(gweiToHex(9))
            expect(initialRequest.feesUpdatedByUser).toBeFalsy()

            markRequestMonitoring(initialRequest)

            setNetworkGas(1, {
              price: {
                selected: 'standard',
                levels: { slow: '', standard: '', fast: gweiToHex(40), asap: '', custom: '' },
                fees: {
                  maxPriorityFeePerGas: gweiToHex(1),
                  maxBaseFeePerGas: gweiToHex(20)
                }
              }
            })

            sendTransaction(() => {
              const replacementRequest = accountRequests[1]
              const bumpedFee = Math.ceil(initialTip * 1.1)
              expect(replacementRequest.data.maxPriorityFeePerGas).toBe(intToHex(bumpedFee))
              expect(replacementRequest.data.maxFeePerGas).toBe(intToHex(20 * 1e9 + bumpedFee))
              expect(replacementRequest.feesUpdatedByUser).toBe(false)
              done()
            })
          })
        } catch (e) {
          done(e)
        }
      })

      it('does not add a buffer to replacement EIP-1559 transactions if the current gas price is already higher', (done) => {
        tx.type = '0x2'
        tx.chainId = addHexPrefix((1).toString(16))

        try {
          sendTransaction(() => {
            const initialRequest = accountRequests[0]
            const initialTip = initialRequest.data.maxPriorityFeePerGas
            const initialMax = initialRequest.data.maxFeePerGas

            expect(initialTip).toBe(gweiToHex(1))
            expect(initialMax).toBe(gweiToHex(9))
            expect(initialRequest.feesUpdatedByUser).toBeFalsy()

            markRequestMonitoring(initialRequest)
            setNetworkGas(1, {
              price: {
                selected: 'standard',
                levels: { slow: '', standard: '', fast: gweiToHex(40), asap: '', custom: '' },
                fees: {
                  maxPriorityFeePerGas: gweiToHex(2),
                  maxBaseFeePerGas: gweiToHex(14)
                }
              }
            })

            sendTransaction(() => {
              const replacementRequest = accountRequests[1]

              expect(replacementRequest.data.maxPriorityFeePerGas).toBe(gweiToHex(2))
              expect(replacementRequest.data.maxFeePerGas).toBe(gweiToHex(16))
              expect(replacementRequest.feesUpdatedByUser).toBeFalsy()
              done()
            })
          })
        } catch (e) {
          done(e)
        }
      })
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

    it('releases its response handler when a sign request is rejected', (done) => {
      expectQueuedRequestRejection(
        (callback) => send({ method: 'eth_sign', params: [address, hexMessage] }, callback),
        done
      )
    })

    it('does not submit a request from an account other than the current one', (done) => {
      const params = ['0xa4581bfe76201f3aa147cce8e360140582260441', message]

      send({ method: 'eth_sign', params }, (err: any) => {
        expect(err.error).toBeTruthy()
        done()
      })
    })
  })

  describe('#personal_sign', () => {
    const message = 'hello, Ethereum!'
    const password = 'supersecret'
    const hexMessage = addHexPrefix(Buffer.from(message, 'utf-8').toString('hex'))

    it('submits a request to sign a personal message with the address first', () => {
      send({ method: 'personal_sign', params: [address, hexMessage, password] })

      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toEqual(hexMessage)
      expect(accountRequests[0].payload.params[2]).toEqual(password)
    })

    it('submits a request to sign a personal message with the message first', () => {
      send({ method: 'personal_sign', params: [hexMessage, address, password] })

      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toEqual(hexMessage)
      expect(accountRequests[0].payload.params[2]).toEqual(password)
    })

    it('submits a request to sign a personal message with a 20-byte message first', () => {
      const addressSizedMessage = '0x6672616d652e7368206973206772656174212121'

      send({ method: 'personal_sign', params: [addressSizedMessage, address, password] })

      expect(accountRequests).toHaveLength(1)
      expect(accountRequests[0].handlerId).toBeTruthy()
      expect(accountRequests[0].payload.params[0]).toBe(address)
      expect(accountRequests[0].payload.params[1]).toEqual(addressSizedMessage)
      expect(accountRequests[0].payload.params[2]).toEqual(password)
    })

    it('does not submit a request from an account other than the current one', (done) => {
      const params = [message, '0xa4581bfe76201f3aa147cce8e360140582260441']

      send({ method: 'personal_sign', params }, (err: any) => {
        expect(err.error).toBeTruthy()
        done()
      })
    })
  })

  describe('#eth_signTypedData', () => {
    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' }
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' }
        ]
      },
      domain: 'domainData',
      primaryType: 'Mail',
      message: {
        from: {
          name: 'Cow',
          wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
        },
        to: {
          name: 'Bob',
          wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
        },
        contents: 'Hello!'
      }
    }

    const typedDataLegacy = [
      {
        type: 'string',
        name: 'fullName',
        value: 'Satoshi Nakamoto'
      },
      {
        type: 'uint32',
        name: 'userId',
        value: '1212'
      }
    ]

    const typedDataInvalid = {
      ...typedData,
      primaryType: 'b0rk'
    }

    const validRequests = [
      {
        method: 'eth_signTypedData',
        params: [address, typedDataLegacy],
        version: SignTypedDataVersion.V1,
        dataDescription: 'legacy'
      },
      {
        method: 'eth_signTypedData',
        params: [address, typedData],
        version: SignTypedDataVersion.V4,
        dataDescription: 'eip-712'
      },
      {
        method: 'eth_signTypedData_v1',
        params: [address, typedDataLegacy],
        version: SignTypedDataVersion.V1,
        dataDescription: 'legacy'
      },
      {
        method: 'eth_signTypedData_v3',
        params: [address, typedData],
        version: SignTypedDataVersion.V3,
        dataDescription: 'eip-712'
      },
      {
        method: 'eth_signTypedData_v4',
        params: [address, typedData],
        version: SignTypedDataVersion.V4,
        dataDescription: 'eip-712'
      },
      {
        method: 'eth_signTypedData',
        params: [typedDataLegacy, address],
        version: SignTypedDataVersion.V1,
        dataFirst: true,
        dataDescription: 'legacy'
      },
      {
        method: 'eth_signTypedData',
        params: [typedData, address],
        version: SignTypedDataVersion.V4,
        dataFirst: true,
        dataDescription: 'eip-712'
      },
      {
        method: 'eth_signTypedData_v1',
        params: [typedDataLegacy, address],
        version: SignTypedDataVersion.V1,
        dataFirst: true,
        dataDescription: 'legacy'
      },
      {
        method: 'eth_signTypedData_v3',
        params: [typedData, address],
        version: SignTypedDataVersion.V3,
        dataFirst: true,
        dataDescription: 'eip-712'
      },
      {
        method: 'eth_signTypedData_v4',
        params: [typedData, address],
        version: SignTypedDataVersion.V4,
        dataFirst: true,
        dataDescription: 'eip-712'
      }
    ]

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

    it('returns typed-data rejection and releases its response handler', (done) => {
      expectQueuedRequestRejection(
        (callback) => send({ method: 'eth_signTypedData_v4', params: [address, typedData] }, callback),
        done
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

    it('handles invalid EIP-712 data by defaulting to v4', () => {
      const params = [typedDataInvalid, address]

      send({ method: 'eth_signTypedData', params })

      verifyRequest(SignTypedDataVersion.V4, typedDataInvalid)
    })

    it('does not submit a request without a message', (done) => {
      const params = [address, { ...typedData, message: undefined }]

      send({ method: 'eth_signTypedData_v3', params }, (err: any) => {
        expect(err.error.message).toBe('Typed data missing message')
        expect(err.error.code).toBe(-1)
        done()
      })
    })

    it('does not submit a request from an unknown account', (done) => {
      const params = ['0xa4581bfe76201f3aa147cce8e360140582260441', typedData]

      send({ method: 'eth_signTypedData_v3', params }, (err: any) => {
        expect(err.error.message).toBe('Unknown account: 0xa4581bfe76201f3aa147cce8e360140582260441')
        expect(err.error.code).toBe(-1)
        done()
      })
    })

    it('does not submit a request to the wrong account', (done) => {
      ;(accounts.current as any).mockReturnValueOnce({ id: '0xa4581bfe76201f3aa147cce8e360140582260441' })
      const params = [address, typedData]

      send({ method: 'eth_signTypedData_v3', params }, (err: any) => {
        expect(err.error.message).toBe('Sign request is not from currently selected account')
        expect(err.error.code).toBe(-1)
        done()
      })
    })

    it('does not submit a request with malformed type data', (done) => {
      const params = [address, 'test']

      send({ method: 'eth_signTypedData_v3', params }, (err: any) => {
        expect(err.error.message).toBe('Malformed typed data')
        expect(err.error.code).toBe(-1)
        done()
      })
    })

    // these signers only support V4+
    const HardwareSignersSupportingV4Only = [SignerType.Ledger, SignerType.Trezor]

    HardwareSignersSupportingV4Only.forEach((signerType) => {
      it(`does not submit a V3 request to a ${signerType}`, (done) => {
        ;(accounts.get as any).mockImplementationOnce((addr: any) => {
          return addr === address ? { id: address, address, lastSignerType: signerType } : {}
        })

        const params = [address, typedData]

        send({ method: 'eth_signTypedData_v3', params }, (err: any) => {
          expect(err.error.message).toMatch(new RegExp(signerType, 'i'))
          expect(err.error.code).toBe(-1)
          done()
        })
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
      it(`passes a request with unhandled method eth_signTypedData${versionExtension} through to the connection`, (done) => {
        mockConnectionError('received unhandled request')

        const params = [address, 'test']

        send({ method: `eth_signTypedData${versionExtension}`, params }, (err: any) => {
          expect(err.error.message).toBe('received unhandled request')
          done()
        })
      })
    })
  })

  describe('subscriptions', () => {
    const eventTypes = ['accountsChanged', 'chainChanged', 'chainsChanged', 'networkChanged']

    describe('#eth_subscribe', () => {
      const subscribe = (eventType: any, cb: any) =>
        send({ id: 9, jsonrpc: '2.0', method: 'eth_subscribe', params: [eventType] }, cb)

      eventTypes.forEach((eventType) => {
        it(`subscribes to ${eventType} events`, () => {
          subscribe(eventType, (response: any) => {
            expect(response.id).toBe(9)
            expect(response.jsonrpc).toBe('2.0')
            expect(response.error).toBe(undefined)
            expect(response.result).toMatch(/0x\w{32}$/)

            expect(provider.subscriptions[eventType]).toHaveLength(1)
            expect(provider.subscriptions[eventType][0].capabilities).toEqual([])
          })
        })
      })

      it('returns an error from the node if attempting to unsubscribe to an unknown event', () => {
        mockConnectionError('unknown event!')

        subscribe('everythingChanged', (response: any) => {
          expect(response.id).toBe(9)
          expect(response.jsonrpc).toBe('2.0')
          expect(response.error.message).toBe('unknown event!')
          expect(response.result).toBe(undefined)
        })
      })
    })

    describe('#eth_unsubscribe', () => {
      const unsubscribe = (id: any, cb: any) =>
        send({ id: 8, jsonrpc: '2.0', method: 'eth_unsubscribe', params: [id] }, cb)

      eventTypes.forEach((eventType) => {
        it(`unsubscribes from ${eventType} events`, () => {
          const subId = '0x1acc2933618a0ff548f03b1c99420366'
          provider.subscriptions[eventType] = [subId]

          unsubscribe(subId, (response: any) => {
            expect(response.id).toBe(8)
            expect(response.jsonrpc).toBe('2.0')
            expect(response.error).toBe(undefined)
            expect(response.result).toBe(true)
            expect(provider.subscriptions[eventType]).toHaveLength(0)
          })
        })
      })

      it('returns an error from the node if attempting to unsubscribe from an unknown subscription', () => {
        mockConnectionError('unknown subscription!')

        provider.subscriptions.accountsChanged = ['0xtest1']
        provider.subscriptions.chainChanged = ['0xtest2']
        provider.subscriptions.chainsChanged = ['0xtest2']
        provider.subscriptions.networkChanged = ['0xtest3']

        unsubscribe('0xanothersub', (response: any) => {
          expect(response.id).toBe(8)
          expect(response.jsonrpc).toBe('2.0')
          expect(response.error.message).toBe('unknown subscription!')
          expect(response.result).toBe(undefined)

          eventTypes.forEach((eventType) => {
            expect(provider.subscriptions[eventType]).toHaveLength(1)
          })
        })
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

  it('does not allow a pre-EIP-1559 transaction with fees that exceeds the hard limit', (done) => {
    // 200 gwei * 10M gas = 2 ETH
    ;(tx as any).chainId = '0x1'
    ;(tx as any).type = '0x0'
    ;(tx as any).gasPrice = toBeHex(parseUnits('210', 'gwei'))
    ;(tx as any).gasLimit = addHexPrefix((1e7).toString(16))

    signAndSend((err: any) => {
      try {
        expect(err.message).toMatch(/over hard limit/)
        done()
      } catch (e) {
        done(e)
      }
    })
  })

  it('does not allow a post-EIP-1559 transaction with fees that exceed the hard limit', (done) => {
    // 200 gwei * 10M gas = 2 ETH
    ;(tx as any).chainId = '0x1'
    ;(tx as any).type = '0x2'
    ;(tx as any).maxFeePerGas = toBeHex(parseUnits('210', 'gwei'))
    ;(tx as any).gasLimit = addHexPrefix((1e7).toString(16))

    signAndSend((err: any) => {
      try {
        expect(err.message).toMatch(/over hard limit/)
        done()
      } catch (e) {
        done(e)
      }
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

      it('sends a successfully signed transaction', (done) => {
        signAndSend((err: any, result: any) => {
          try {
            expect(err).toBe(null)
            expect(result).toBe(txHash)
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('responds to a successful transaction request with the transaction hash result', (done) => {
        provider.handlers[(request as any).handlerId] = (response: any) => {
          try {
            expect(response.result).toBe(txHash)
            done()
          } catch (e) {
            done(e)
          }
        }

        signAndSend()
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

      it('responds to a failed transaction request with the payload', (done) => {
        provider.handlers[(request as any).handlerId] = (err: any) => {
          expect(err.id).toBe((request as any).payload.id)
          expect(err.jsonrpc).toBe((request as any).payload.jsonrpc)
          expect(err.error.message).toBe(errorMessage)
          done()
        }

        signAndSend()
      })
    })
  })
})

describe('#assetsChanged', () => {
  const subscription = {
    id: '0x9509a964a8d24a17fcfc7b77fc575b71',
    originId: '8073729a-5e59-53b7-9e69-5d9bcff94087',
    capabilities: []
  }

  beforeEach(() => {
    provider.subscriptions.assetsChanged = [subscription]
  })

  it('fires an assetsChanged event when an account has permission', (done) => {
    ;(hasSubscriptionPermission as any).mockReturnValueOnce(true)

    const assets = { account: address, nativeCurrency: [], erc20: ['tokens'] }

    provider.once('data:subscription', (payload: any) => {
      expect(payload.method).toBe('eth_subscription')
      expect(payload.jsonrpc).toBe('2.0')
      expect(payload.params.subscription).toBe(subscription.id)
      expect(payload.params.result).toEqual(assets)

      expect(hasSubscriptionPermission).toHaveBeenCalledWith('assetsChanged', address, subscription)

      done()
    })

    provider.assetsChanged(address, assets)
  })

  it('does not fire an assetsChanged event when an account does not have permission', () => {
    ;(hasSubscriptionPermission as any).mockReturnValueOnce(false)

    const assets = { account: address, nativeCurrency: [], erc20: ['tokens'] }

    provider.once('data:subscription', () => {
      throw new Error('event fired to account without permission!')
    })

    provider.assetsChanged(address, assets)
  })
})

describe('state change events', () => {
  // these are more like integration tests as they test that the provider, the store, and observers
  // are all working correctly with each other
  const subscription = {
    id: '0x9509a964a8d24a17fcfc7b77fc575b71',
    originId: '8073729a-5e59-53b7-9e69-5d9bcff94087',
    capabilities: []
  }

  beforeEach(() => {
    provider.removeAllListeners('data:subscription')
  })

  it('fires a chainChanged event to subscribers', (done) => {
    // set the known state to compare the test event to
    setOrigin(subscription.originId, { chain: { id: 1, type: 'ethereum' } })

    provider.subscriptions.chainChanged = [subscription]
    provider.once('data:subscription', (event: any) => {
      expect(event.method).toBe('eth_subscription')
      expect(event.jsonrpc).toBe('2.0')
      expect(event.params.subscription).toBe(subscription.id)
      expect(event.params.result).toBe('0x89')
      done()
    })

    setOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087', {
      chain: { id: 137, type: 'ethereum' }
    })
  })

  it('fires a chainsChanged event to subscribers', (done) => {
    const networks = {
      1: {
        name: 'test',
        id: 1,
        explorer: 'https://etherscan.io',
        connection: { primary: { connected: true }, secondary: { connected: false } },
        on: true
      }
    }

    const networksMeta = {
      1: {
        primaryColor: 'accent5',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
          icon: 'ethereum'
        }
      }
    }

    // set the known state to compare the test event to
    store.setState((state: any) => {
      state.main.networks.ethereum = networks
      state.main.networksMeta.ethereum = networksMeta
    })
    timers.runAllTimers()

    provider.subscriptions.chainsChanged = [subscription]
    provider.once('data:subscription', (event: any) => {
      expect(event.method).toBe('eth_subscription')
      expect(event.jsonrpc).toBe('2.0')
      expect(event.params.subscription).toBe(subscription.id)
      expect(event.params.result).toStrictEqual([
        {
          name: 'test',
          chainId: 1,
          networkId: 1,
          icon: [{ url: 'ethereum' }],
          explorers: [{ url: 'https://etherscan.io' }],
          external: {
            wallet: {
              colors: [{ r: 90, g: 181, b: 178, hex: '#5ab5b2' }]
            }
          },
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
          },
          connected: true
        },
        {
          name: 'Polygon',
          chainId: 137,
          networkId: 137,
          icon: [],
          explorers: [{ url: 'https://polygonscan.com' }],
          external: {
            wallet: {
              colors: [{ r: 60, g: 40, b: 234, hex: '#3c28ea' }]
            }
          },
          nativeCurrency: {
            name: 'Matic',
            symbol: 'MATIC',
            decimals: 18
          },
          connected: true
        }
      ])

      done()
    })

    const polygon = {
      name: 'Polygon',
      id: 137,
      explorer: 'https://polygonscan.com',
      connection: { primary: { connected: true }, secondary: { connected: false } },
      on: true
    }

    ;(hasSubscriptionPermission as any).mockReturnValueOnce(true)
    store.setState((state: any) => {
      state.main.networks.ethereum = { ...networks, 137: polygon }
      state.main.networksMeta.ethereum = {
        ...networksMeta,
        137: {
          primaryColor: 'accent8',
          nativeCurrency: { symbol: 'MATIC', name: 'Matic', decimals: 18 }
        }
      }
    })
    timers.runAllTimers()
  })

  it('fires an assetsChanged event to subscribers', (done) => {
    const ethPriceData = { usd: { price: 3815.91 } }
    const ethBalance = {
      symbol: 'ETH',
      balance: '0xe7',
      address: NATIVE_CURRENCY,
      chainId: 1,
      displayBalance: ''
    }

    const tokenPriceData = { usd: { price: 225.35 } }
    const tokenBalance = {
      symbol: 'OHM',
      name: 'Olympus',
      decimals: 9,
      balance: '0x606401fc9',
      displayBalance: '',
      chainId: 1,
      address: '0x383518188c0c6d7730d91b2c03a03c837814a899'
    }

    ;(hasSubscriptionPermission as any).mockReturnValueOnce(true)
    accounts.current = () => ({ id: address })
    provider.subscriptions.assetsChanged = [subscription]

    provider.once('data:subscription', (event: any) => {
      expect(event.method).toBe('eth_subscription')
      expect(event.jsonrpc).toBe('2.0')
      expect(event.params.subscription).toBe(subscription.id)
      expect(event.params.result).toEqual({
        account: address,
        nativeCurrency: [
          {
            ...ethBalance,
            name: 'Ether',
            decimals: 18,
            currencyInfo: { name: 'Ether', symbol: 'ETH', decimals: 18, ...ethPriceData }
          }
        ],
        erc20: [{ ...tokenBalance, tokenInfo: { lastKnownPrice: { ...tokenPriceData } } }]
      })

      done()
    })

    store.setState((state: any) => {
      state.main.accounts[address] ||= {}
      state.main.accounts[address].balances = { lastUpdated: new Date() }
      state.main.permissions[address] = { 'test.frame': { origin: 'test.frame', provider: true } }
      state.main.networksMeta.ethereum[1] ||= {}
      state.main.networksMeta.ethereum[1].nativeCurrency = {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        ...ethPriceData
      }
      state.main.rates[tokenBalance.address] = tokenPriceData
      state.main.balances[address] = [ethBalance, tokenBalance]
      state.main.tokens.byId[`1:${tokenBalance.address}`] = {
        address: tokenBalance.address,
        chainId: 1,
        decimals: tokenBalance.decimals,
        name: tokenBalance.name,
        symbol: tokenBalance.symbol,
        custom: false,
        curated: false,
        sources: ['onchain'],
        updatedAt: 0
      }
      state.main.currentAccount = address
    })

    // assets notifications are intentionally coalesced
    timers.advanceTimersByTime(800)
  })
})

// utility functions //

function mockConnectionError(message: any) {
  ;(connection.send as any).mockImplementation((p: any, cb: any) =>
    cb({ id: p.id, jsonrpc: p.jsonrpc, error: { message, code: -1 } })
  )
}
