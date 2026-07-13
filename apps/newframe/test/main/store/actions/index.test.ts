import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'

import {
  addNetwork as addNetworkAction,
  removeBalance as removeBalanceAction,
  setBalances as setBalancesAction,
  setPortfolioBalances as setPortfolioBalancesAction,
  removeBalances as removeBalancesAction,
  addCustomTokens as addCustomTokensAction,
  removeCustomTokens as removeTokensAction,
  addKnownTokens as addKnownTokensAction,
  removeKnownTokens as removeKnownTokensAction,
  resetSavedData as resetSavedDataAction,
  setScanning as setScanningAction,
  initOrigin as initOriginAction,
  clearOrigins as clearOriginsAction,
  removeOrigin as removeOriginAction,
  addOriginRequest as addOriginRequestAction,
  switchOriginChain as switchOriginChainAction,
  removeNetwork as removeNetworkAction,
  updateNetwork as updateNetworkAction,
  activateNetwork as activateNetworkAction,
  setBlockHeight as setBlockHeightAction,
  setNetworkIcon as setNetworkIconAction,
  updateAccount as updateAccountAction,
  setAutoDiscoverTokens as setAutoDiscoverTokensAction,
  setPortfolioApiKey as setPortfolioApiKeyAction,
  revokePermission as revokePermissionAction,
  upsertSubmittedActivity as upsertSubmittedActivityAction,
  updateActivity as updateActivityAction,
  finalizeActivity as finalizeActivityAction,
  pruneActivity as pruneActivityAction,
  navClearReq as clearNavRequestAction,
  navClearSigner as clearNavSignerAction,
  updateTypedDataRequest as updateTypedDataAction
} from '../../../../main/store/actions'
import {
  dismissNotification as dismissNotificationAction,
  expireNotification as expireNotificationAction,
  resolveNotification as resolveNotificationAction,
  upsertPendingNotification as upsertPendingNotificationAction
} from '../../../../resources/store/actions.panel'
import { NATIVE_CURRENCY } from '../../../../resources/constants'
import { toTokenId } from '../../../../resources/domain/balance'

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

  let networks: any, networksMeta: any

  const updaterFn = (node: any, update: any) => {
    if (node !== 'main') throw new Error(`attempted to update wrong node: ${node}`)
    update({ networks, networksMeta })
  }

  const addNetwork = (network: any) => addNetworkAction(updaterFn, network)

  beforeEach(() => {
    networks = { ethereum: {} }
    networksMeta = { ethereum: {} }
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
    ;(polygonNetwork as any).primaryRpc = 'https://polygon-rpc.com'

    addNetwork(polygonNetwork)

    expect(networks.ethereum['137'].primaryRpc).toBeUndefined()
    expect(networks.ethereum['137'].connection.primary.custom).toBe('https://polygon-rpc.com')
  })

  it('adds a network with the correct secondary RPC', () => {
    ;(polygonNetwork as any).secondaryRpc = 'https://rpc-mainnet.matic.network'

    addNetwork(polygonNetwork)

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
      blockHeight: 0,
      name: 'Polygon',
      icon: '',
      nativeCurrency: {
        symbol: 'MATIC',
        name: '',
        icon: '',
        decimals: 18
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
  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.balances')
    expect(address).toBe(owner)

    balances = update(balances)
  }

  const setBalances = (updatedBalances: any) => setBalancesAction(updaterFn, owner, updatedBalances)

  let balances: any

  beforeEach(() => {
    balances = [
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(305).toString(16))
      }
    ]
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

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main.balances')

    balances = update(balances)
  }

  const removeBalance = (key: any) => removeBalanceAction(updaterFn, 1, key)

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

  const updaterFn = (node: any, update: any) => {
    if (node === 'main.tokens.custom') {
      tokens = update(tokens)
    }

    if (node === 'main.balances') {
      balances = update(balances)
    }
  }

  const addTokens = (tokensToAdd: any) => addCustomTokensAction(updaterFn, tokensToAdd)

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

  const updaterFn = (node: any, update: any) => {
    if (node === 'main.tokens.custom') {
      customTokens = update(customTokens)
    } else if (node === 'main.tokens.known') {
      knownTokens = update(knownTokens)
    }
  }

  const removeTokens = (tokensToRemove: any) => removeTokensAction(updaterFn, tokensToRemove)

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

  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.tokens.known')
    expect(address).toBe(account)

    tokens = update(tokens)
  }

  const addTokens = (tokensToAdd: any) => addKnownTokensAction(updaterFn, account, tokensToAdd)

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

describe('#setScanning', () => {
  let isScanning: any

  beforeAll(() => {
    isScanning = false
  })

  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.scanning')
    expect(address).toBe(owner)

    isScanning = update()
  }

  const setScanning = (scanning: any) => setScanningAction(updaterFn, owner, scanning)

  it('immediately sets the state to scanning', () => {
    setScanning(true)

    expect(isScanning).toBe(true)
  })

  it('sets the state back to not scanning after 1 second', () => {
    setScanning(false)

    expect(isScanning).toBe(true)

    jest.advanceTimersByTime(1000)

    expect(isScanning).toBe(false)
  })
})

describe('#initOrigin', () => {
  let origins: any
  const creationDate = new Date('2022-05-24')

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main.origins')
    origins = update()
  }

  const initOrigin = (id: any, origin: any) => initOriginAction(updaterFn, id, origin)

  beforeEach(() => {
    origins = {}
    jest.setSystemTime(creationDate)
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
  let origins: any
  let permissions: any

  const updaterFn = (node: any, update: any) => {
    if (node === 'main.origins') origins = update()
    if (node === 'main.permissions') permissions = update(permissions)
  }

  const clearOrigins = () => clearOriginsAction(updaterFn)

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
  })

  it('should clear all existing origins and attached permissions', () => {
    ;(clearOrigins as any)(origins)

    expect(origins).toEqual({})
    expect(permissions).toEqual({})
  })
})

describe('#revokePermission', () => {
  let permissions: any

  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.permissions')
    permissions[address] = update(permissions[address])
  }

  const revokePermission = (address: string, originId: string) =>
    revokePermissionAction(updaterFn, address, originId)

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
  let origins: any
  let permissions: any

  const updaterFn = (node: any, update: any) => {
    if (node === 'main.origins') origins = update(origins)
    if (node === 'main.permissions') permissions = update(permissions)
  }

  const removeOrigin = (originId: any) => removeOriginAction(updaterFn, originId)

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
  let origins: any

  const creationTime = new Date('2022-05-24').getTime()
  const updateTime = creationTime + 1000 * 60 * 60 * 24 * 2 // 2 days
  const endTime = creationTime + 1000 * 60 * 60 * 24 * 1 // 1 day

  const updaterFn = (node: any, id: any, update: any) => {
    expect(node).toBe('main.origins')
    origins[id] = update(origins[id])
  }

  const addOriginRequest = (id: any) => addOriginRequestAction(updaterFn, id)

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
  let origins: any = {}

  const updaterFn = (node: any, origin: any, update: any) => {
    const nodePath = [node, origin].join('.')
    expect(nodePath).toBe('main.origins.91f6971d-ba85-52d7-a27e-6af206eb2433')

    origins[origin] = update()
  }

  beforeEach(() => {
    origins = {
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {
        chain: { id: 1, type: 'ethereum' }
      }
    }
  })

  const switchChain = (chainId: any, type: any) =>
    switchOriginChainAction(updaterFn, '91f6971d-ba85-52d7-a27e-6af206eb2433', chainId, type)

  it('should switch the chain for an origin', () => {
    switchChain(50, 'ethereum')

    expect(origins['91f6971d-ba85-52d7-a27e-6af206eb2433'].chain).toStrictEqual({ id: 50, type: 'ethereum' })
  })
})

describe('#removeNetwork', () => {
  let main: any

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main')
    main = update(main)
  }

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
  })

  const removeNetwork = (networkId: any, networkType = 'ethereum') =>
    removeNetworkAction(updaterFn, { id: networkId, type: networkType })

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

describe('#updateNetwork', () => {
  let main: any

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main')
    main = update(main)
  }

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
          chain: { id: 50, type: 'ethereum' }
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
  })

  const updateNetwork = (existingNetwork: any, newNetwork: any) =>
    updateNetworkAction(updaterFn, existingNetwork, newNetwork)

  it('should update the network', () => {
    updateNetwork(
      { id: '0x4', type: 'ethereum', name: '', explorer: '', symbol: '' },
      { id: '0x42', type: 'ethereum', name: 'test', explorer: 'explorer.test', symbol: 'TEST' }
    )

    expect(main.networks.ethereum).toStrictEqual({
      1: {},
      66: { id: 66, type: 'ethereum', name: 'test', explorer: 'explorer.test', symbol: 'TEST' },
      137: {}
    })
  })

  it('should trim string properties', () => {
    updateNetwork(
      { id: '0x4', type: 'ethereum', name: '', explorer: '', symbol: '' },
      { id: '0x42', type: 'ethereum', name: 'test     ', explorer: '   explorer.test    ', symbol: 'TEST  ' }
    )

    expect(main.networks.ethereum).toStrictEqual({
      1: {},
      66: { id: 66, type: 'ethereum', name: 'test', explorer: 'explorer.test', symbol: 'TEST' },
      137: {}
    })
  })

  it('should update the chainId for origins using the updated network', () => {
    updateNetwork(
      { id: '0x4', type: 'ethereum', name: '', explorer: '', symbol: '' },
      { id: '0x42', type: 'ethereum', name: 'test', explorer: 'explorer.test', symbol: 'TEST' }
    )

    expect(main.origins).toStrictEqual({
      '91f6971d-ba85-52d7-a27e-6af206eb2433': {
        chain: expect.objectContaining({ id: 1, type: 'ethereum' })
      },
      '8073729a-5e59-53b7-9e69-5d9bcff94087': {
        chain: expect.objectContaining({ id: 66, type: 'ethereum' })
      },
      'd7acc008-6411-5486-bb2d-0c0cfcddbb92': {
        chain: expect.objectContaining({ id: 50, type: 'ethereum' })
      },
      '695112ec-43e2-52a8-8f69-5c36837d6d13': {
        chain: expect.objectContaining({ id: 66, type: 'ethereum' })
      }
    })
  })

  it('should correctly update the networksMeta', () => {
    const icon = 'http://icon.com'
    const nativeCurrencyIcon = 'http://icon2.com'
    const nativeCurrencyName = 'TEST_NAME'
    const symbol = 'TEST'
    updateNetwork(
      { id: '0x4', type: 'ethereum', name: '', explorer: '', symbol: '' },
      {
        id: '0x4',
        type: 'ethereum',
        name: 'test',
        explorer: 'explorer.test',
        symbol,
        nativeCurrencyName,
        nativeCurrencyIcon,
        icon
      }
    )

    expect(main.networksMeta.ethereum[4]).toStrictEqual({
      icon,
      nativeCurrency: { symbol, name: nativeCurrencyName, icon: nativeCurrencyIcon },
      symbol
    })
  })
})

describe('#activateNetwork', () => {
  const main = {
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

  const updaterFn = (node: any, ...args: any[]) => {
    if (node === 'main') {
      const update = args[0]
      update(main)
    }

    if (node === 'main.networks') {
      const [type, chainId, on, update] = args
      ;(main.networks as any)[type][chainId][on] = update()
    }
  }

  const activateNetwork = (type: any, chainId: any, active: any) =>
    activateNetworkAction(updaterFn, type, chainId, active)

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

describe('#setBlockHeight', () => {
  let main: any

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main.networksMeta.ethereum')
    main.networksMeta.ethereum = update(main.networksMeta.ethereum)
  }

  beforeEach(() => {
    main = {
      networksMeta: {
        ethereum: {
          1: {
            blockHeight: 0
          },
          4: {
            blockHeight: 0
          },
          137: {
            blockHeight: 0
          }
        }
      }
    }
  })

  const setBlockHeight = (chainId: any, blockHeight: any) =>
    setBlockHeightAction(updaterFn, chainId, blockHeight)

  it('should update the block height for the expected chain', () => {
    setBlockHeight(4, 500)

    expect(main.networksMeta.ethereum).toStrictEqual({
      1: { blockHeight: 0 },
      4: { blockHeight: 500 },
      137: { blockHeight: 0 }
    })
  })
})

describe('#setNetworkIcon', () => {
  let main: any

  const updaterFn = (node: any, type: any, update: any) => {
    expect(node).toBe('main.networksMeta')
    main.networksMeta[type] = update(main.networksMeta[type])
  }

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
  })

  const setNetworkIcon = (chainId: number, icon: string) =>
    setNetworkIconAction(updaterFn, 'ethereum', chainId, icon)

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

describe('#updateAccount', () => {
  let main: any

  const updaterFn = (node: any, id: any, update: any) => {
    if (node === 'main.accounts') {
      main.accounts[id] = update(main.accounts[id])
    }

    if (node === 'main.accountsMeta') {
      main.accountsMeta[id] = update(main.accountsMeta[id])
    }
  }

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
  })

  const setAccount = (id: any, updatedAccount: any) =>
    updateAccountAction(updaterFn, { ...updatedAccount, id })

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

describe('#removeBalances', () => {
  let balances: any

  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.balances')
    expect(address).toBe(owner)

    balances = update(balances)
  }

  const removeBalances = (setToRemove: any) => removeBalancesAction(updaterFn, owner, setToRemove)

  beforeEach(() => {
    balances = Object.values(testTokens).map((token) => ({
      ...token,
      balance: addHexPrefix(BigInt(120).toString(16))
    }))
  })

  it('should remove all tokens from the removal set from an accounts balance', () => {
    const removalSet = new Set(Object.values(testTokens).map(toTokenId))
    removeBalances(removalSet)
    expect(balances.length).toBe(0)
  })

  it('should only remove tokens from the removal set from an accounts balance', () => {
    const removalSet = new Set()
    removalSet.add(toTokenId(testTokens.badger))
    removeBalances(removalSet)
    expect(balances.length).toBe(1)
  })
})

describe('#setPortfolioBalances', () => {
  let main: any

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main')
    main = update(main)
  }

  const setPortfolioBalances = (balances: any[]) => setPortfolioBalancesAction(updaterFn, owner, balances)

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

  const updaterFn = (node: string, update: (value: boolean, state: any) => boolean) => {
    expect(node).toBe('main.autoDiscoverTokens')
    autoDiscoverTokens = update(autoDiscoverTokens, { main: { portfolioApiKey: 'zk_test' } })
  }

  it('sets the persisted auto-discovery preference', () => {
    autoDiscoverTokens = true

    setAutoDiscoverTokensAction(updaterFn, false)

    expect(autoDiscoverTokens).toBe(false)
  })

  it('enables auto-discovery when a portfolio API key is set', () => {
    autoDiscoverTokens = false

    setAutoDiscoverTokensAction(updaterFn, true)

    expect(autoDiscoverTokens).toBe(true)
  })

  it('does not enable auto-discovery without a portfolio API key', () => {
    autoDiscoverTokens = false

    const updaterWithoutKey = (node: string, update: (value: boolean, state: any) => boolean) => {
      expect(node).toBe('main.autoDiscoverTokens')
      autoDiscoverTokens = update(autoDiscoverTokens, { main: { portfolioApiKey: '' } })
    }

    setAutoDiscoverTokensAction(updaterWithoutKey, true)

    expect(autoDiscoverTokens).toBe(false)
  })
})

describe('#setPortfolioApiKey', () => {
  const updates: Record<string, unknown> = {}

  const updaterFn = (node: string, update: (value?: unknown) => unknown) => {
    updates[node] = update(updates[node])
  }

  beforeEach(() => {
    Object.keys(updates).forEach((key) => delete updates[key])
  })

  it('sets the persisted portfolio API key without whitespace', () => {
    setPortfolioApiKeyAction(updaterFn, ' zk_test \n')

    expect(updates['main.portfolioApiKey']).toBe('zk_test')
    expect(updates['main.autoDiscoverTokens']).toBeUndefined()
  })

  it('disables auto-discovery when the portfolio API key is cleared', () => {
    setPortfolioApiKeyAction(updaterFn, '')

    expect(updates['main.portfolioApiKey']).toBe('')
    expect(updates['main.autoDiscoverTokens']).toBe(false)
  })
})

describe('#removeKnownTokens', () => {
  let knownTokens: any

  const updaterFn = (node: any, address: any, update: any) => {
    expect(node).toBe('main.tokens.known')
    expect(address).toBe(owner)

    knownTokens = update(knownTokens)
  }

  const removeKnownTokens = (setToRemove: any) => removeKnownTokensAction(updaterFn, owner, setToRemove)

  beforeEach(() => {
    knownTokens = Object.values(testTokens)
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
  let main: any

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('main')
    main = update(main)
  }

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
  })

  it('clears cached known tokens, their balances, activity, and orders without removing custom tokens', () => {
    resetSavedDataAction(updaterFn)

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

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('windows.dash.nav')

    nav = update(nav)
  }

  const clearSigner = clearNavSignerAction.bind(null, updaterFn)

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

  const updaterFn = (node: any, update: any) => {
    expect(node).toBe('windows.panel.nav')

    nav = update(nav)
  }

  const clearRequest = clearNavRequestAction.bind(null, updaterFn)

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

describe('#updateTypedDataRequest', () => {
  let requests: any
  const request = '79928538-c971-4cf0-8498-fa4e8017398b'

  const updaterFn = (node: any, account: any, leaf: any, update: any) => {
    expect(node).toBe('main.accounts')
    expect(account).toBe(owner)
    expect(leaf).toBe('requests')

    requests = update(requests)
  }

  const updateSignatureMessage = (reqId: any, newData: any) =>
    updateTypedDataAction(updaterFn, owner, reqId, newData)

  beforeEach(() => {
    requests = {
      [request]: {
        handlerId: '79928538-c971-4cf0-8498-fa4e8017398b',
        type: 'signTypedData',
        typedMessage: {
          data: {
            oldAttribute: true
          }
        }
      },
      some_other_id: {
        handlerId: 'wow_such_valid_handerId'
      }
    }
  })

  it('should add a new property to a request ', () => {
    expect(requests[request].doesNotExistYet).toBeUndefined()
    updateSignatureMessage(request, {
      doesNotExistYet: true
    })

    expect(requests[request].doesNotExistYet).toBeTruthy()
  })

  it('should not change any properties which are not altered in an update', () => {
    updateSignatureMessage(request, {
      doesNotExistYet: true
    })

    expect(requests[request].typedMessage.data.oldAttribute).toBeTruthy()
  })
})

describe('#activity actions', () => {
  let activity: any

  const updaterFn = (node: any, ...args: any[]) => {
    expect(node).toBe('main.activity')

    if (typeof args[0] === 'string') {
      const [id, update] = args
      activity[id] = update(activity[id])
    } else {
      const [update] = args
      activity = update(activity)
    }
  }

  const upsertSubmittedActivity = (transaction: any) => upsertSubmittedActivityAction(updaterFn, transaction)
  const updateActivity = (id: string, update: any) => updateActivityAction(updaterFn, id, update)
  const finalizeActivity = (id: string, status: string, update: any) =>
    finalizeActivityAction(updaterFn, id, status, update)
  const pruneActivity = (id: string) => pruneActivityAction(updaterFn, id)

  beforeEach(() => {
    activity = {}
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
  let notifications: any

  const updaterFn = (node: any, ...args: any[]) => {
    expect(node).toBe('view.notifications')

    if (typeof args[0] === 'string') {
      const [id, update] = args
      notifications[id] = update(notifications[id])
    } else {
      const [update] = args
      notifications = update(notifications)
    }
  }

  const upsertPendingNotification = (notification: any) =>
    upsertPendingNotificationAction(updaterFn, notification)
  const resolveNotification = (id: string, state: 'completed' | 'failed', update: any) =>
    resolveNotificationAction(updaterFn, id, state, update)
  const dismissNotification = (id: string) => dismissNotificationAction(updaterFn, id)
  const expireNotification = (id: string) => expireNotificationAction(updaterFn, id)

  beforeEach(() => {
    notifications = {}
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
