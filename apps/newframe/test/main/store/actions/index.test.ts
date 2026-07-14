import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'
import { createStore } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'

import {
  createCanonicalActions,
  type CanonicalActions,
  type CanonicalStore
} from '../../../../main/store/actions'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import { toTokenId } from '../../../../resources/domain/balance'

function createActionHarness(
  initial: any,
  onChange?: (state: CanonicalStore) => void
): { actions: CanonicalActions; getState: () => CanonicalStore } {
  const defaults: any = {
    windows: {
      panel: { nav: [], footer: { height: 40 } },
      dash: { nav: [], footer: { height: 40 } }
    },
    panel: {},
    selected: {},
    tray: {},
    view: { notifications: {} },
    main: {
      networks: { ethereum: {} },
      networksMeta: { ethereum: {} },
      origins: {},
      permissions: {},
      accounts: {},
      accountOrder: [],
      accountsMeta: {},
      balances: {},
      activity: {},
      orders: {},
      tokens: { custom: [], known: {} },
      scanning: {}
    }
  }
  const data = {
    ...defaults,
    ...initial,
    windows: {
      ...defaults.windows,
      ...initial.windows,
      panel: { ...defaults.windows.panel, ...initial.windows?.panel },
      dash: { ...defaults.windows.dash, ...initial.windows?.dash }
    },
    view: { ...defaults.view, ...initial.view },
    main: { ...defaults.main, ...initial.main }
  }

  const store = createStore<CanonicalStore>()(
    immer((set, get) => ({
      ...data,
      ...createCanonicalActions(set, get)
    }))
  )

  onChange?.(store.getState())
  if (onChange) store.subscribe(onChange)

  return { actions: store.getState(), getState: store.getState }
}

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

const owner = '0xa8be0f701d0f37088600164e71bffc0ad652c251'

const testTokens = {
  zrx: {
    chainId: 1,
    address: '0xe41d2489571d322189246dafa5ebde1f4699f498',
    symbol: 'ZRX',
    decimals: 18
  },
  badger: {
    chainId: 42161,
    address: '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e',
    symbol: 'BADGER',
    decimals: 18
  }
}

describe('#addNetwork', () => {
  const polygonNetwork = {
    id: 137,
    name: 'Polygon',
    type: 'ethereum',
    layer: 'sidechain',
    explorer: 'https://polygonscan.com',
    symbol: 'MATIC'
  }

  let actions: CanonicalActions
  let networks: any, networksMeta: any

  const addNetwork = (network: any) => actions.addNetwork(network)

  beforeEach(() => {
    networks = { ethereum: {} }
    networksMeta = { ethereum: {} }
    actions = createActionHarness({ main: { networks, networksMeta } }, (state) => {
      networks = state.main.networks
      networksMeta = state.main.networksMeta
    }).actions
  })

  it('adds a network with the correct id', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].id).toBe(137)
  })

  it('adds a network with the correct id if the id is a number represented as a string', () => {
    addNetwork({ ...polygonNetwork, id: '137' })

    expect(networks.ethereum['137'].id).toBe(137)
  })

  it('adds a network with the correct name', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].name).toBe('Polygon')
  })

  it('adds a network with the correct symbol', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].symbol).toBe('MATIC')
  })

  it('adds a network with the correct explorer', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].explorer).toBe('https://polygonscan.com')
  })

  it('adds a network that is on by default', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].on).toBe(true)
  })

  it('adds a network with the correct primary RPC', () => {
    addNetwork({ ...polygonNetwork, primaryRpc: 'https://polygon-rpc.com' })

    expect(networks.ethereum['137'].primaryRpc).toBeUndefined()
    expect(networks.ethereum['137'].connection.primary.custom).toBe('https://polygon-rpc.com')
  })

  it('adds a network with the correct secondary RPC', () => {
    addNetwork({ ...polygonNetwork, secondaryRpc: 'https://rpc-mainnet.matic.network' })

    expect(networks.ethereum['137'].secondaryRpc).toBeUndefined()
    expect(networks.ethereum['137'].connection.secondary.custom).toBe('https://rpc-mainnet.matic.network')
  })

  it('adds a network with the correct default connection presets', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].connection.presets).toEqual({ local: 'direct' })
  })

  it('adds a network with the correct default primary connection settings', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].connection.primary).toEqual({
      on: true,
      current: 'custom',
      status: 'loading',
      connected: false,
      type: '',
      network: '',
      custom: ''
    })
  })

  it('adds a network with the correct default secondary connection settings', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].connection.secondary).toEqual({
      on: false,
      current: 'custom',
      status: 'loading',
      connected: false,
      type: '',
      network: '',
      custom: ''
    })
  })

  it('adds a network with the correct default gas settings', () => {
    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].gas).toEqual({
      price: {
        selected: 'standard',
        levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
      }
    })
  })

  it('adds a network with the correct default metadata', () => {
    addNetwork(polygonNetwork)

    expect(networksMeta.ethereum['137']).toEqual({
      name: 'Polygon',
      primaryColor: 'accent1',
      icon: '',
      nativeCurrency: {
        symbol: 'MATIC',
        name: '',
        icon: '',
        decimals: 18,
        usd: { price: 0, change24hr: 0 }
      },
      gas: {
        price: {
          selected: 'standard',
          levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
        }
      }
    })
  })

  it('does not add the network if id is not a parseable number', () => {
    addNetwork({ ...polygonNetwork, id: 'test' })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if name is not defined', () => {
    addNetwork({ ...polygonNetwork, name: undefined })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if explorer is not defined', () => {
    addNetwork({ ...polygonNetwork, explorer: undefined })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if symbol is not defined', () => {
    addNetwork({ ...polygonNetwork, symbol: undefined })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if type is not a string', () => {
    addNetwork({ ...polygonNetwork, type: 2 })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if type is not "ethereum"', () => {
    addNetwork({ ...polygonNetwork, type: 'solana' })

    expect(Object.keys(networks.ethereum)).toHaveLength(0)
    expect(Object.keys(networksMeta.ethereum)).toHaveLength(0)
  })

  it('does not add the network if the networks already exists', () => {
    networks.ethereum['137'] = { ...polygonNetwork }

    addNetwork({
      id: 137,
      type: 'ethereum',
      name: 'Matic v1',
      explorer: 'https://rpc-mainnet.maticvigil.com',
      symbol: 'MATIC'
    })

    expect(networks.ethereum['137'].name).toBe('Polygon')
    expect(networks.ethereum['137'].explorer).toBe('https://polygonscan.com')
  })
})

describe('#setBalances', () => {
  let actions: CanonicalActions
  let balances: any
  const setBalances = (updatedBalances: any) => actions.setBalances(owner, updatedBalances)

  beforeEach(() => {
    balances = [
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(305).toString(16))
      }
    ]
    actions = createActionHarness({ main: { balances: { [owner]: balances } } }, (state) => {
      balances = state.main.balances[owner]
    }).actions
  })

  it('adds a new balance', () => {
    setBalances([
      {
        ...testTokens.zrx,
        balance: addHexPrefix(BigInt(79832332).toString(16))
      }
    ])

    expect(balances).toEqual([
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(305).toString(16))
      },
      {
        ...testTokens.zrx,
        balance: addHexPrefix(BigInt(79832332).toString(16))
      }
    ])
  })

  it('updates an existing balance to a positive amount', () => {
    setBalances([
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(419).toString(16))
      }
    ])

    expect(balances).toEqual([
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(419).toString(16))
      }
    ])
  })

  it('updates an existing balance to zero', () => {
    setBalances([
      {
        ...testTokens.badger,
        balance: '0x0'
      }
    ])

    expect(balances).toEqual([
      {
        ...testTokens.badger,
        balance: '0x0'
      }
    ])
  })
})

describe('#removeBalance', () => {
  let balances: any = {
    [owner]: [
      {
        ...testTokens.zrx,
        balance: addHexPrefix(BigInt(798564).toString(16))
      },
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(15543).toString(16))
      }
    ],
    '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e': [
      {
        ...testTokens.zrx,
        balance: addHexPrefix(BigInt(8201343).toString(16))
      },
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(101988).toString(16))
      }
    ]
  }

  const removeBalance = (key: any) => {
    const { actions } = createActionHarness({ main: { balances } }, (state) => {
      balances = state.main.balances
    })
    actions.removeBalance(1, key)
  }

  it('removes a balance from all accounts', () => {
    removeBalance(testTokens.zrx.address)

    expect(balances[owner]).not.toContainEqual(expect.objectContaining({ address: testTokens.zrx.address }))
    expect(balances[owner]).toHaveLength(1)
    expect(balances['0xd0e3872f5fa8ecb49f1911f605c0da90689a484e']).not.toContainEqual(
      expect.objectContaining({ address: testTokens.zrx.address })
    )
    expect(balances['0xd0e3872f5fa8ecb49f1911f605c0da90689a484e']).toHaveLength(1)
  })
})

describe('#addCustomTokens', () => {
  let tokens: any = [],
    balances: any = {}

  const addTokens = (tokensToAdd: any) => {
    const { actions } = createActionHarness(
      { main: { tokens: { custom: tokens, known: {} }, balances } },
      (state) => {
        tokens = state.main.tokens.custom
        balances = state.main.balances
      }
    )
    actions.addCustomTokens(tokensToAdd)
  }

  it('adds a token', () => {
    tokens = [testTokens.zrx]

    addTokens([testTokens.badger])

    expect(tokens).toStrictEqual([testTokens.zrx, testTokens.badger])
  })

  it('overwrites a token', () => {
    tokens = [testTokens.zrx, testTokens.badger]

    const updatedBadgerToken = {
      ...testTokens.badger,
      symbol: 'BAD'
    }

    addTokens([updatedBadgerToken])

    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual(testTokens.zrx)
    expect(tokens[1].symbol).toBe('BAD')
  })

  it('updates an existing balance for a custom token', () => {
    const account = '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e'

    balances = {
      [account]: [
        {
          address: testTokens.badger.address,
          chainId: testTokens.badger.chainId,
          symbol: 'BDG',
          name: 'Old Badger',
          logoURI: 'http://logo.io'
        }
      ]
    }

    const updatedBadgerToken = {
      ...testTokens.badger,
      symbol: 'BADGER',
      name: 'Badger Token'
    }

    addTokens([updatedBadgerToken])

    expect(balances[account]).toStrictEqual([
      {
        address: testTokens.badger.address,
        chainId: testTokens.badger.chainId,
        symbol: 'BADGER',
        name: 'Badger Token',
        logoURI: 'http://logo.io'
      }
    ])
  })
})

describe('#removeCustomTokens', () => {
  let customTokens: any = [],
    knownTokens = {}

  const removeTokens = (tokensToRemove: any) => {
    const { actions } = createActionHarness(
      { main: { tokens: { custom: customTokens, known: knownTokens } } },
      (state) => {
        customTokens = state.main.tokens.custom
        knownTokens = state.main.tokens.known
      }
    )
    actions.removeCustomTokens(tokensToRemove)
  }

  it('removes a token', () => {
    customTokens = [testTokens.zrx, testTokens.badger]

    const tokenToRemove = { ...testTokens.zrx }

    removeTokens([tokenToRemove])

    expect(customTokens).toStrictEqual([testTokens.badger])
  })

  it('does not modify tokens if they cannot be found', () => {
    customTokens = [testTokens.zrx, testTokens.badger]

    const tokenToRemove = {
      chainId: 1,
      address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
      symbol: 'OHM'
    }

    removeTokens([tokenToRemove])

    expect(customTokens).toStrictEqual([testTokens.zrx, testTokens.badger])
  })

  it('does not remove a token with the same address but different chain id', () => {
    const tokenToRemove = {
      ...testTokens.badger,
      chainId: 1
    }

    customTokens = [testTokens.zrx, testTokens.badger, tokenToRemove]

    removeTokens([tokenToRemove])

    expect(customTokens).toStrictEqual([testTokens.zrx, testTokens.badger])
  })

  it('does not remove a token with the same chain id but different address', () => {
    const tokenToRemove = {
      ...testTokens.zrx,
      address: '0xa7a82dd06901f29ab14af63faf3358ad101724a8'
    }

    customTokens = [testTokens.zrx, testTokens.badger, tokenToRemove]

    removeTokens([tokenToRemove])

    expect(customTokens).toStrictEqual([testTokens.zrx, testTokens.badger])
  })

  it('removes the token from the list of known tokens for an address', () => {
    const address = '0xa7a82dd06901f29ab14af63faf3358ad101724a8'

    knownTokens = {
      [address]: [{ ...testTokens.zrx }]
    }

    removeTokens([{ ...testTokens.zrx }])

    expect(knownTokens).toStrictEqual({ [address]: [] })
  })
})

describe('#addKnownTokens', () => {
  let tokens: any = []
  const account = '0xfaff9f426e8071e03eebbfefe9e7bf4b37565ab9'

  const addTokens = (tokensToAdd: any) => {
    const { actions } = createActionHarness(
      { main: { tokens: { custom: [], known: { [account]: tokens } } } },
      (state) => {
        tokens = state.main.tokens.known[account]
      }
    )
    actions.addKnownTokens(account, tokensToAdd)
  }

  it('adds a token', () => {
    tokens = [testTokens.zrx]

    addTokens([testTokens.badger])

    expect(tokens).toStrictEqual([testTokens.zrx, testTokens.badger])
  })

  it('overwrites a token', () => {
    tokens = [testTokens.zrx, testTokens.badger]

    const updatedBadgerToken = {
      ...testTokens.badger,
      symbol: 'BAD'
    }

    addTokens([updatedBadgerToken])

    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual(testTokens.zrx)
    expect(tokens[1].symbol).toBe('BAD')
  })
})

describe('#initOrigin', () => {
  let actions: CanonicalActions
  let origins: any
  const creationDate = new Date('2022-05-24')

  const initOrigin = (id: any, origin: any) => actions.initOrigin(id, origin)

  beforeEach(() => {
    origins = {}
    jest.setSystemTime(creationDate)
    actions = createActionHarness({ main: { origins } }, (state) => {
      origins = state.main.origins
    }).actions
  })

  it('creates a new origin', () => {
    const origin = { name: 'frame.test', chain: { id: 137, type: 'ethereum' } }

    initOrigin('91f6971d-ba85-52d7-a27e-6af206eb2433', origin)

    expect(origins['91f6971d-ba85-52d7-a27e-6af206eb2433']).toEqual({
      name: 'frame.test',
      chain: {
        id: 137,
        type: 'ethereum'
      },
      session: {
        requests: 1,
        startedAt: creationDate.getTime(),
        lastUpdatedAt: creationDate.getTime()
      }
    })
  })
})

describe('#clearOrigins', () => {
  let actions: CanonicalActions
  let origins: any
  let permissions: any

  const clearOrigins = () => actions.clearOrigins()

  beforeEach(() => {
    origins = {
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {},
      '8073729a-5e59-53b7-9e69-5d9bcff94087': {},
      'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {}
    }
    permissions = {
      '0xabc': {
        '91f6971d-ba85-52d7-a27e-6af206eb2433': {
          origin: 'frame.test',
          provider: true
        }
      }
    }
    actions = createActionHarness({ main: { origins, permissions } }, (state) => {
      origins = state.main.origins
      permissions = state.main.permissions
    }).actions
  })

  it('should clear all existing origins and attached permissions', () => {
    clearOrigins()

    expect(origins).toEqual({})
    expect(permissions).toEqual({})
  })
})

describe('#revokePermission', () => {
  let actions: CanonicalActions
  let permissions: any

  const revokePermission = (address: string, originId: string) => actions.revokePermission(address, originId)

  beforeEach(() => {
    permissions = {
      '0xabc': {
        '8073729a-5e59-53b7-9e69-5d9bcff94087': {
          origin: 'frame.test',
          provider: true
        },
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          origin: 'keep.test',
          provider: true
        }
      }
    }
    actions = createActionHarness({ main: { permissions } }, (state) => {
      permissions = state.main.permissions
    }).actions
  })

  it('removes the permission entry instead of disabling it', () => {
    revokePermission('0xabc', '8073729a-5e59-53b7-9e69-5d9bcff94087')

    expect(permissions).toEqual({
      '0xabc': {
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          origin: 'keep.test',
          provider: true
        }
      }
    })
  })
})

describe('#removeOrigin', () => {
  let actions: CanonicalActions
  let origins: any
  let permissions: any

  const removeOrigin = (originId: any) => actions.removeOrigin(originId)

  beforeEach(() => {
    origins = {
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {},
      '8073729a-5e59-53b7-9e69-5d9bcff94087': {},
      'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {}
    }
    permissions = {
      '0xabc': {
        '8073729a-5e59-53b7-9e69-5d9bcff94087': {
          origin: 'frame.test',
          provider: true
        },
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          origin: 'keep.test',
          provider: true
        }
      }
    }
    actions = createActionHarness({ main: { origins, permissions } }, (state) => {
      origins = state.main.origins
      permissions = state.main.permissions
    }).actions
  })

  it('should remove the specified origin and attached permissions', () => {
    removeOrigin('8073729a-5e59-53b7-9e69-5d9bcff94087')

    expect(origins).toEqual({
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {},
      'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {}
    })
    expect(permissions).toEqual({
      '0xabc': {
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          origin: 'keep.test',
          provider: true
        }
      }
    })
  })
})

describe('#addOriginRequest', () => {
  let actions: CanonicalActions
  let origins: any

  const creationTime = new Date('2022-05-24').getTime()
  const updateTime = creationTime + 1000 * 60 * 60 * 24 * 2 // 2 days
  const endTime = creationTime + 1000 * 60 * 60 * 24 * 1 // 1 day

  const addOriginRequest = (id: any) => actions.addOriginRequest(id)

  beforeEach(() => {
    jest.setSystemTime(updateTime)

    origins = {
      activeOrigin: {
        chain: { id: 10, type: 'ethereum' },
        session: {
          requests: 3,
          startedAt: creationTime,
          lastUpdatedAt: creationTime
        }
      },
      staleOrigin: {
        chain: { id: 42161, type: 'ethereum' },
        session: {
          requests: 14,
          startedAt: creationTime,
          endedAt: endTime,
          lastUpdatedAt: endTime
        }
      }
    }
    actions = createActionHarness({ main: { origins } }, (state) => {
      origins = state.main.origins
    }).actions
  })

  it('updates the timestamp for an existing session', () => {
    addOriginRequest('activeOrigin')

    expect(origins.activeOrigin.session.startedAt).toBe(creationTime)
    expect(origins.activeOrigin.session.lastUpdatedAt).toBe(updateTime)
  })

  it('increments the request count for an existing session', () => {
    origins.activeOrigin.session.requests = 3

    addOriginRequest('activeOrigin')

    expect(origins.activeOrigin.session.requests).toBe(4)
  })

  it('handles a request for a previously ended session', () => {
    addOriginRequest('staleOrigin')

    expect(origins.staleOrigin.session.startedAt).toBe(updateTime)
    expect(origins.staleOrigin.session.endedAt).toBe(undefined)
    expect(origins.staleOrigin.session.lastUpdatedAt).toBe(updateTime)
  })

  it('resets the request count when starting a new session', () => {
    addOriginRequest('staleOrigin')

    expect(origins.staleOrigin.session.requests).toBe(1)
  })
})

describe('#switchOriginChain', () => {
  let actions: CanonicalActions
  let origins: any = {}

  beforeEach(() => {
    origins = {
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {
        chain: { id: 1, type: 'ethereum' }
      }
    }
    actions = createActionHarness({ main: { origins } }, (state) => {
      origins = state.main.origins
    }).actions
  })

  const switchChain = (chainId: any, type: any) =>
    actions.switchOriginChain('91f6971d-ba85-52d7-a27e-6af206eb2433', chainId, type)

  it('should switch the chain for an origin', () => {
    switchChain(50, 'ethereum')

    expect(origins['91f6971d-ba85-52d7-a27e-6af206eb2433'].chain).toStrictEqual({ id: 50, type: 'ethereum' })
  })
})

describe('#removeNetwork', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      origins: {
        '91f6971d-ba85-52d7-a27e-6af206eb2433': {
          chain: { id: 1, type: 'ethereum' }
        },
        '8073729a-5e59-53b7-9e69-5d9bcff94087': {
          chain: { id: 4, type: 'ethereum' }
        },
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          chain: { id: 50, type: 'cosmos' }
        },
        '695112ec-43e2-52a8-8f69-5c36837d6d13': {
          chain: { id: 4, type: 'ethereum' }
        }
      },
      networks: {
        ethereum: {
          1: {},
          4: {},
          137: {}
        },
        cosmos: {
          50: {}
        }
      },
      networksMeta: {
        ethereum: {
          1: {},
          4: {},
          137: {}
        },
        cosmos: {
          50: {}
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  const removeNetwork = (networkId: any, networkType = 'ethereum') =>
    actions.removeNetwork({ id: networkId, type: networkType })

  it('should delete the network and meta', () => {
    removeNetwork(4)

    expect(main.networks.ethereum).toStrictEqual({ 1: {}, 137: {} })
    expect(main.networksMeta.ethereum).toStrictEqual({ 1: {}, 137: {} })
  })

  it('should switch the chain for origins using the deleted network to mainnet', () => {
    removeNetwork(4)

    expect(main.origins).toStrictEqual({
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {
        chain: { id: 1, type: 'ethereum' }
      },
      '8073729a-5e59-53b7-9e69-5d9bcff94087': {
        chain: { id: 1, type: 'ethereum' }
      },
      'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
        chain: { id: 50, type: 'cosmos' }
      },
      '695112ec-43e2-52a8-8f69-5c36837d6d13': {
        chain: { id: 1, type: 'ethereum' }
      }
    })
  })

  describe('when passed the last network of a given type', () => {
    it('should not delete the last network of a given type', () => {
      removeNetwork(50, 'cosmos')

      expect(main.networks.cosmos[50]).toStrictEqual({})
      expect(main.networksMeta.cosmos[50]).toStrictEqual({})
    })

    it('should not update its origins', () => {
      removeNetwork(50, 'cosmos')

      expect(main.origins).toStrictEqual({
        '91f6971d-ba85-52d7-a27e-6af206eb2433': {
          chain: { id: 1, type: 'ethereum' }
        },
        '8073729a-5e59-53b7-9e69-5d9bcff94087': {
          chain: { id: 4, type: 'ethereum' }
        },
        'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
          chain: { id: 50, type: 'cosmos' }
        },
        '695112ec-43e2-52a8-8f69-5c36837d6d13': {
          chain: { id: 4, type: 'ethereum' }
        }
      })
    })
  })
})

describe('#activateNetwork', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      networks: {
        ethereum: {
          137: {
            on: false
          }
        }
      },
      origins: {
        'frame.test': {
          chain: {
            id: 137
          }
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  const activateNetwork = (type: any, chainId: any, active: any) =>
    actions.activateNetwork(type, chainId, active)

  it('activates the given chain', () => {
    main.networks.ethereum[137].on = false

    activateNetwork('ethereum', 137, true)

    expect(main.networks.ethereum[137].on).toBe(true)
  })

  it('switches the chain for origins from the deactivated chain to mainnet', () => {
    main.origins['frame.test'].chain.id = 137

    activateNetwork('ethereum', 137, false)

    expect(main.origins['frame.test'].chain.id).toBe(1)
  })
})

describe('#setNetworkIcon', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      networksMeta: {
        ethereum: {
          1: {
            icon: ''
          },
          8453: {
            icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png'
          }
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  const setNetworkIcon = (chainId: number, icon: string) => actions.setNetworkIcon('ethereum', chainId, icon)

  it('should update the network icon for the expected chain', () => {
    setNetworkIcon(8453, 'frame-cache:icon:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    expect(main.networksMeta.ethereum).toStrictEqual({
      1: { icon: '' },
      8453: {
        icon: 'frame-cache:icon:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    })
  })
})

describe('#upsertAccount', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    jest.setSystemTime(new Date('2022-11-17T11:01:58.135Z'))

    main = {
      accounts: {
        1: {
          id: '1',
          name: 'cool account',
          lastSignerType: 'ledger',
          balances: {}
        }
      },
      accountsMeta: {
        'e42ee170-4601-5428-bac5-d8d92fe049e8': {
          name: 'cool account',
          lastUpdated: 1568682918135
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  const setAccount = (id: any, updatedAccount: any) => actions.upsertAccount({ ...updatedAccount, id })

  it('should update the account', () => {
    setAccount('1', { name: 'cool account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accounts).toStrictEqual({
      1: { id: '1', name: 'cool account', lastSignerType: 'seed', status: 'ok', balances: {} }
    })
  })

  it('should not update account balances', () => {
    setAccount('1', { name: 'cool account', lastSignerType: 'seed', status: 'ok', balances: 'ignored' })

    expect(main.accounts).toStrictEqual({
      1: { id: '1', name: 'cool account', lastSignerType: 'seed', status: 'ok', balances: {} }
    })
  })

  it('should create a new account', () => {
    setAccount('2', { name: 'new cool account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accounts).toStrictEqual({
      1: { id: '1', name: 'cool account', lastSignerType: 'ledger', balances: {} },
      2: { id: '2', name: 'new cool account', lastSignerType: 'seed', status: 'ok', balances: {} }
    })
  })

  it('should update existing accountMeta with the expected data', () => {
    setAccount('1', { name: 'not so cool account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accountsMeta).toStrictEqual({
      'e42ee170-4601-5428-bac5-d8d92fe049e8': { name: 'not so cool account', lastUpdated: 1668682918135 }
    })
  })

  it('should create new accountMeta with the expected data', () => {
    setAccount('2', { name: 'not so cool account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accountsMeta).toStrictEqual({
      'e42ee170-4601-5428-bac5-d8d92fe049e8': { name: 'cool account', lastUpdated: 1568682918135 },
      '0d6c930e-3495-56cc-993f-8da3a6150003': { name: 'not so cool account', lastUpdated: 1668682918135 }
    })
  })

  it(`should not create a new value for a default label`, () => {
    setAccount('2', { name: 'hot account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accountsMeta).toStrictEqual({
      'e42ee170-4601-5428-bac5-d8d92fe049e8': { name: 'cool account', lastUpdated: 1568682918135 }
    })
  })

  it(`should not update an existing value with a default label`, () => {
    setAccount('1', { name: 'hot account', lastSignerType: 'seed', status: 'ok' })

    expect(main.accountsMeta).toStrictEqual({
      'e42ee170-4601-5428-bac5-d8d92fe049e8': { name: 'cool account', lastUpdated: 1568682918135 }
    })
  })
})

describe('#setPortfolioBalances', () => {
  let actions: CanonicalActions
  let main: any
  const setPortfolioBalances = (balances: any[]) => actions.setPortfolioBalances(owner, balances)

  beforeEach(() => {
    const staleKnownToken = {
      chainId: 42161,
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'OLD',
      decimals: 18
    }

    main = {
      tokens: {
        custom: [testTokens.zrx],
        known: {
          [owner]: [testTokens.badger, staleKnownToken]
        }
      },
      balances: {
        [owner]: [
          { address: NATIVE_CURRENCY, chainId: 1, balance: '0x1' },
          { ...testTokens.zrx, balance: '0x2' },
          { ...testTokens.badger, balance: '0x3' },
          { ...staleKnownToken, balance: '0x5' }
        ]
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  it('replaces cached portfolio balances without removing custom token balances', () => {
    const nativeBalance = { address: NATIVE_CURRENCY, chainId: 1, balance: '0x6' }
    const zerionBalance = { ...testTokens.badger, balance: '0x4' }

    setPortfolioBalances([nativeBalance, zerionBalance])

    expect(main.balances[owner]).toStrictEqual([
      { ...testTokens.zrx, balance: '0x2' },
      nativeBalance,
      zerionBalance
    ])
  })
})

describe('#setAutoDiscoverTokens', () => {
  let autoDiscoverTokens: boolean

  const setAutoDiscoverTokens = (value: boolean, portfolioApiKey = 'zk_test') => {
    const { actions } = createActionHarness({ main: { autoDiscoverTokens, portfolioApiKey } }, (state) => {
      autoDiscoverTokens = state.main.autoDiscoverTokens
    })
    actions.setAutoDiscoverTokens(value)
  }

  it('sets the persisted auto-discovery preference', () => {
    autoDiscoverTokens = true

    setAutoDiscoverTokens(false)

    expect(autoDiscoverTokens).toBe(false)
  })

  it('enables auto-discovery when a portfolio API key is set', () => {
    autoDiscoverTokens = false

    setAutoDiscoverTokens(true)

    expect(autoDiscoverTokens).toBe(true)
  })

  it('does not enable auto-discovery without a portfolio API key', () => {
    autoDiscoverTokens = false

    setAutoDiscoverTokens(true, '')

    expect(autoDiscoverTokens).toBe(false)
  })
})

describe('#setPortfolioApiKey', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = { portfolioApiKey: '', autoDiscoverTokens: true }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  it('sets the persisted portfolio API key without whitespace', () => {
    actions.setPortfolioApiKey(' zk_test \n')

    expect(main.portfolioApiKey).toBe('zk_test')
    expect(main.autoDiscoverTokens).toBe(true)
  })

  it('disables auto-discovery when the portfolio API key is cleared', () => {
    actions.setPortfolioApiKey('')

    expect(main.portfolioApiKey).toBe('')
    expect(main.autoDiscoverTokens).toBe(false)
  })
})

describe('#removeKnownTokens', () => {
  let actions: CanonicalActions
  let knownTokens: any
  const removeKnownTokens = (setToRemove: any) => actions.removeKnownTokens(owner, setToRemove)

  beforeEach(() => {
    knownTokens = Object.values(testTokens)
    actions = createActionHarness(
      { main: { tokens: { custom: [], known: { [owner]: knownTokens } } } },
      (state) => {
        knownTokens = state.main.tokens.known[owner]
      }
    ).actions
  })

  it('should remove all tokens from the removal set from an accounts known tokens', () => {
    const removalSet = new Set(Object.values(testTokens).map(toTokenId))
    removeKnownTokens(removalSet)
    expect(knownTokens.length).toBe(0)
  })

  it('should only remove tokens from the removal set from an accounts known tokens', () => {
    const removalSet = new Set([toTokenId(testTokens.badger)])
    removeKnownTokens(removalSet)
    expect(knownTokens.length).toBe(1)
  })
})

describe('#resetSavedData', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      tokens: {
        custom: [testTokens.zrx],
        known: {
          [owner]: [testTokens.zrx],
          '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e': [testTokens.badger]
        }
      },
      balances: {
        [owner]: [
          { ...testTokens.zrx, balance: '0x1' },
          { ...testTokens.badger, balance: '0x2' }
        ],
        '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e': [{ ...testTokens.badger, balance: '0x3' }]
      },
      activity: {
        '0xabc': {
          id: '0xabc',
          hash: '0xabc',
          status: 'succeeded'
        }
      },
      orders: {
        'order-1': {
          orderId: 'order-1',
          status: 'open'
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  it('clears cached known tokens, their balances, activity, and orders without removing custom tokens', () => {
    actions.resetSavedData()

    expect(main.tokens.custom).toStrictEqual([testTokens.zrx])
    expect(main.tokens.known).toStrictEqual({})
    expect(main.balances[owner]).toStrictEqual([{ ...testTokens.zrx, balance: '0x1' }])
    expect(main.balances['0xd0e3872f5fa8ecb49f1911f605c0da90689a484e']).toStrictEqual([])
    expect(main.activity).toStrictEqual({})
    expect(main.orders).toStrictEqual({})
  })
})

describe('#navClearSigner', () => {
  let nav: any

  const clearSigner = (signerId: string) => {
    const { actions } = createActionHarness({ windows: { dash: { nav } } }, (state) => {
      nav = (state.windows.dash as any).nav
    })
    actions.navClearSigner(signerId)
  }

  beforeEach(() => {
    nav = []
  })

  it('should remove a specific signer from the nav', () => {
    nav = [
      {
        view: 'expandedSigner',
        data: {
          signer: '1a'
        }
      },
      {
        view: 'expandedSigner',
        data: {
          signer: '2b'
        }
      }
    ]

    const [req1, _req2] = nav

    clearSigner('2b')

    expect(nav).toStrictEqual([req1])
  })
})

describe('#navClearReq', () => {
  let nav: any

  const clearRequest = (requestId: string, showRequestInbox = true) => {
    const { actions } = createActionHarness({ windows: { panel: { nav } } }, (state) => {
      nav = state.windows.panel.nav
    })
    actions.navClearReq(requestId, showRequestInbox)
  }

  beforeEach(() => {
    nav = []
  })

  it('should remove a specific request from the nav', () => {
    nav = [
      {
        view: 'requestView',
        data: {
          requestId: '1a'
        }
      },
      {
        view: 'requestView',
        data: {
          requestId: '2b'
        }
      },
      {
        view: 'expandedModule',
        data: {
          id: 'requests'
        }
      }
    ]

    const [req1, , inbox] = nav

    clearRequest('2b')

    expect(nav).toStrictEqual([req1, inbox])
  })

  it('should remove the request inbox when not requested', () => {
    nav = [
      {
        view: 'requestView',
        data: {
          requestId: '1c'
        }
      },
      {
        view: 'expandedModule',
        data: {
          id: 'requests'
        }
      }
    ]

    clearRequest('1c', false)

    expect(nav).toStrictEqual([])
  })
})

describe('#activity actions', () => {
  let actions: CanonicalActions
  let activity: any

  const upsertSubmittedActivity = (transaction: any) => actions.upsertSubmittedActivity(transaction)
  const updateActivity = (id: string, update: any) => actions.updateActivity(id, update)
  const finalizeActivity = (id: string, status: string, update: any) =>
    actions.finalizeActivity(id, status, update)
  const pruneActivity = (id: string) => actions.pruneActivity(id)

  beforeEach(() => {
    activity = {}
    actions = createActionHarness({ main: { activity } }, (state) => {
      activity = state.main.activity
    }).actions
  })

  it('tracks a transaction activity lifecycle', () => {
    const submittedAt = new Date('2024-01-01T00:00:00.000Z')
    const confirmingAt = new Date('2024-01-01T00:01:00.000Z')
    const completedAt = new Date('2024-01-01T00:02:00.000Z')

    jest.setSystemTime(submittedAt)
    upsertSubmittedActivity({
      id: 'tx-1',
      hash: '0x123',
      handlerId: 'handler-1',
      account: owner,
      chainId: 1,
      chainType: 'ethereum',
      origin: 'frame.test',
      payload: { method: 'eth_sendTransaction' },
      display: { title: 'Send ETH' }
    })

    expect(activity['tx-1']).toEqual({
      id: 'tx-1',
      hash: '0x123',
      handlerId: 'handler-1',
      account: owner,
      chainId: 1,
      chainType: 'ethereum',
      origin: 'frame.test',
      payload: { method: 'eth_sendTransaction' },
      display: { title: 'Send ETH' },
      status: 'submitted',
      submittedAt: submittedAt.getTime(),
      updatedAt: submittedAt.getTime(),
      confirmations: 0
    })

    jest.setSystemTime(confirmingAt)
    updateActivity('tx-1', { status: 'confirming', confirmations: 2 })

    expect(activity['tx-1']).toEqual(
      expect.objectContaining({
        status: 'confirming',
        confirmations: 2,
        updatedAt: confirmingAt.getTime()
      })
    )

    jest.setSystemTime(completedAt)
    finalizeActivity('tx-1', 'succeeded', { receipt: { status: '0x1' } })

    expect(activity['tx-1']).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        completedAt: completedAt.getTime(),
        updatedAt: completedAt.getTime(),
        receipt: { status: '0x1' }
      })
    )

    pruneActivity('tx-1')

    expect(activity).toEqual({})
  })
})

describe('#status notification actions', () => {
  let actions: CanonicalActions
  let notifications: any

  const upsertPendingNotification = (notification: any) => actions.upsertPendingNotification(notification)
  const resolveNotification = (id: string, state: 'completed' | 'failed', update: any) =>
    actions.resolveNotification(id, state, update)
  const dismissNotification = (id: string) => actions.dismissNotification(id)
  const expireNotification = (id: string) => actions.expireNotification(id)

  beforeEach(() => {
    notifications = {}
    actions = createActionHarness({ view: { notifications } }, (state) => {
      notifications = state.view.notifications
    }).actions
  })

  it('tracks a transient status notification lifecycle', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z')
    const resolvedAt = new Date('2024-01-01T00:01:00.000Z')
    const dismissedAt = new Date('2024-01-01T00:02:00.000Z')
    const expiresAt = resolvedAt.getTime() + 5000

    jest.setSystemTime(createdAt)
    upsertPendingNotification({
      id: 'notification-1',
      title: 'Transaction submitted',
      detail: 'Waiting for confirmation',
      target: { activityId: 'tx-1' }
    })

    expect(notifications['notification-1']).toEqual({
      id: 'notification-1',
      title: 'Transaction submitted',
      detail: 'Waiting for confirmation',
      target: { activityId: 'tx-1' },
      state: 'pending',
      createdAt: createdAt.getTime(),
      updatedAt: createdAt.getTime(),
      hidden: false
    })

    jest.setSystemTime(resolvedAt)
    resolveNotification('notification-1', 'completed', {
      detail: 'Confirmed',
      expiresAt
    })

    expect(notifications['notification-1']).toEqual(
      expect.objectContaining({
        state: 'completed',
        detail: 'Confirmed',
        expiresAt,
        updatedAt: resolvedAt.getTime()
      })
    )

    jest.setSystemTime(dismissedAt)
    dismissNotification('notification-1')

    expect(notifications['notification-1']).toEqual(
      expect.objectContaining({
        hidden: true,
        dismissedAt: dismissedAt.getTime(),
        updatedAt: dismissedAt.getTime()
      })
    )

    expireNotification('notification-1')

    expect(notifications).toEqual({})
  })
})

describe('#canonical action boundaries', () => {
  it('owns account and request mutations as atomic Immer actions', () => {
    const accountId = '0xaccount'
    let publishedStates = 0
    const harness = createActionHarness(
      {
        main: {
          accounts: {
            [accountId]: { id: accountId, address: accountId, name: 'Before', requests: {} }
          }
        }
      },
      () => {
        publishedStates += 1
      }
    )

    harness.actions.patchAccount(accountId, {
      id: 'replacement-id',
      address: 'replacement-address',
      name: 'After'
    } as any)
    harness.actions.upsertAccountRequest(accountId, {
      handlerId: 'request-1',
      type: 'access',
      origin: 'test',
      account: accountId,
      payload: { id: 1, jsonrpc: '2.0', method: 'eth_requestAccounts', params: [] }
    })
    harness.actions.patchAccountRequest(accountId, 'request-1', (request) => {
      request.status = 'pending' as any
      request.notice = 'Waiting'
    })

    expect(harness.getState().main.accounts[accountId]).toEqual(
      expect.objectContaining({
        name: 'After',
        id: accountId,
        address: accountId,
        requests: {
          'request-1': expect.objectContaining({ status: 'pending', notice: 'Waiting' })
        }
      })
    )

    harness.actions.removeAccountRequest(accountId, 'request-1')
    expect(harness.getState().main.accounts[accountId].requests).toEqual({})
    expect(publishedStates).toBe(5) // initial observation plus four atomic publications
  })

  it('commits account selection atomically without creating a second selected-account fact', () => {
    let publishedStates = 0
    const harness = createActionHarness(
      {
        selected: { minimized: true, open: false },
        main: { currentAccount: 'old-account' }
      },
      () => {
        publishedStates += 1
      }
    )

    harness.actions.setAccount({ id: 'new-account' })

    const state = harness.getState()
    expect(state.main.currentAccount).toBe('new-account')
    expect('current' in state.selected).toBe(false)
    expect(state.selected.minimized).toBe(false)
    expect(state.selected.open).toBe(true)
    expect(publishedStates).toBe(2) // initial observation plus one atomic Zustand publication
  })

  it('commits panel notification fields in one publication', () => {
    let publishedStates = 0
    const harness = createActionHarness({}, () => {
      publishedStates += 1
    })

    harness.actions.notify('success', { id: 'notification-1' })

    expect(harness.getState().view.notify).toBe('success')
    expect(harness.getState().view.notifyData).toEqual({ id: 'notification-1' })
    expect(publishedStates).toBe(2) // initial observation plus one atomic Zustand publication
  })
})
