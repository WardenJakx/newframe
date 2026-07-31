import { afterAll, beforeAll, beforeEach, describe, expect, it, setSystemTime } from 'bun:test'

import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'

import { type CanonicalActions } from './actions'
import { NATIVE_CURRENCY } from '../../domain/token/constants'
import { toTokenId } from '../../domain/balance'
import { customTokens, tokensForAccount } from '../../domain/token'
import { DEFAULT_PROFILE_ID } from '../../domain/state/main'
import { createTestStore as createActionHarness } from '../../test/support/createTestStore'

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
    name: '0x',
    decimals: 18
  },
  badger: {
    chainId: 42161,
    address: '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e',
    symbol: 'BADGER',
    name: 'Badger',
    decimals: 18
  }
}

function tokenRecord(token: any, options: { custom?: boolean; curated?: boolean } = {}) {
  return {
    ...token,
    custom: Boolean(options.custom),
    curated: Boolean(options.curated),
    sources: [options.custom ? 'custom' : 'onchain'],
    updatedAt: 0
  }
}

function tokenCatalog(tokens: any[], accountTokenIds: Record<string, string[]> = {}) {
  return {
    byId: Object.fromEntries(tokens.map((token) => [toTokenId(token), token])),
    accountTokenIds
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

  it('creates the complete runtime network and metadata projections atomically', () => {
    const { actions, getState } = createActionHarness({})

    actions.addNetwork({
      ...polygonNetwork,
      id: '137',
      primaryRpc: 'https://polygon-rpc.com',
      secondaryRpc: 'https://rpc-mainnet.matic.network'
    })

    expect({
      network: getState().main.networks.ethereum['137'],
      metadata: getState().main.networksMeta.ethereum['137']
    } as unknown).toStrictEqual({
      network: {
        id: 137,
        type: 'ethereum',
        layer: 'sidechain',
        isTestnet: false,
        name: 'Polygon',
        explorer: 'https://polygonscan.com',
        symbol: 'MATIC',
        on: true,
        connection: {
          presets: { local: 'direct' },
          primary: {
            on: true,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://polygon-rpc.com'
          },
          secondary: {
            on: false,
            current: 'custom',
            status: 'loading',
            connected: false,
            type: '',
            network: '',
            custom: 'https://rpc-mainnet.matic.network'
          }
        },
        gas: {
          price: {
            selected: 'standard',
            levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
          }
        }
      },
      metadata: {
        name: 'Polygon',
        primaryColor: 'accent1',
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
      }
    })
  })

  it('rejects every invalid network input class without a partial write', () => {
    const invalidNetworks = [
      { ...polygonNetwork, id: 'test' },
      { ...polygonNetwork, name: undefined },
      { ...polygonNetwork, explorer: undefined },
      { ...polygonNetwork, symbol: undefined },
      { ...polygonNetwork, type: 2 },
      { ...polygonNetwork, type: 'solana' },
      { ...polygonNetwork, primaryRpc: 'file:///wallet' },
      { ...polygonNetwork, secondaryRpc: 'https://user:secret@rpc.test' }
    ]

    for (const invalidNetwork of invalidNetworks) {
      const { actions, getState } = createActionHarness({})
      actions.addNetwork(invalidNetwork)

      expect({
        networks: getState().main.networks,
        metadata: getState().main.networksMeta
      }).toStrictEqual({
        networks: { ethereum: {} },
        metadata: { ethereum: {} }
      })
    }
  })

  it('preserves the existing network and metadata when the id already exists', () => {
    const existingMetadata = { name: 'Polygon metadata' }
    const { actions, getState } = createActionHarness({
      main: {
        networks: { ethereum: { '137': polygonNetwork } },
        networksMeta: { ethereum: { '137': existingMetadata } }
      }
    })

    actions.addNetwork({
      id: 137,
      type: 'ethereum',
      name: 'Matic v1',
      explorer: 'https://rpc-mainnet.maticvigil.com',
      symbol: 'MATIC'
    })

    expect({
      network: getState().main.networks.ethereum['137'],
      metadata: getState().main.networksMeta.ethereum['137']
    } as unknown).toStrictEqual({ network: polygonNetwork, metadata: existingMetadata })
  })
})

describe('#setBalances', () => {
  it('merges new balances and replaces existing positive and zero amounts', () => {
    const { actions, getState } = createActionHarness({
      main: {
        balances: {
          [owner]: [
            {
              ...testTokens.badger,
              balance: addHexPrefix(BigInt(305).toString(16))
            }
          ]
        }
      }
    })

    actions.setBalances(owner, [
      {
        ...testTokens.zrx,
        balance: addHexPrefix(BigInt(79832332).toString(16))
      },
      {
        ...testTokens.badger,
        balance: addHexPrefix(BigInt(419).toString(16))
      }
    ])

    expect(getState().main.balances[owner]).toStrictEqual([
      {
        address: testTokens.zrx.address,
        chainId: testTokens.zrx.chainId,
        balance: addHexPrefix(BigInt(79832332).toString(16)),
        displayBalance: ''
      },
      {
        address: testTokens.badger.address,
        chainId: testTokens.badger.chainId,
        balance: addHexPrefix(BigInt(419).toString(16)),
        displayBalance: ''
      }
    ])

    actions.setBalances(owner, [
      {
        address: testTokens.badger.address,
        chainId: testTokens.badger.chainId,
        balance: '0x0',
        displayBalance: ''
      }
    ])

    expect(getState().main.balances[owner]).toStrictEqual([
      {
        address: testTokens.zrx.address,
        chainId: testTokens.zrx.chainId,
        balance: addHexPrefix(BigInt(79832332).toString(16)),
        displayBalance: ''
      },
      {
        address: testTokens.badger.address,
        chainId: testTokens.badger.chainId,
        balance: '0x0',
        displayBalance: ''
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

describe('#upsertTokens', () => {
  it('stores custom token metadata once in the global catalog', () => {
    const { actions, getState } = createActionHarness({})

    actions.upsertTokens([testTokens.badger], { custom: true, source: 'custom' })

    expect(customTokens(getState().main.tokens)).toEqual([
      expect.objectContaining({ ...testTokens.badger, custom: true, sources: ['custom'] })
    ])
  })

  it('associates discovered tokens with an account without duplicating metadata', () => {
    const account = '0xfaff9f426e8071e03eebbfefe9e7bf4b37565ab9'
    const { actions, getState } = createActionHarness({})

    actions.upsertTokens([testTokens.badger], { account, source: 'onchain' })
    actions.upsertTokens([{ ...testTokens.badger, symbol: 'BAD' }], {
      account,
      source: 'portfolio'
    })

    expect(Object.keys(getState().main.tokens.byId)).toHaveLength(1)
    expect(tokensForAccount(getState().main.tokens, account)).toEqual([
      expect.objectContaining({ symbol: 'BAD', sources: ['onchain', 'portfolio'] })
    ])
  })

  it('keeps custom metadata authoritative over later discovery', () => {
    const { actions, getState } = createActionHarness({})
    actions.upsertTokens([{ ...testTokens.badger, symbol: 'CUSTOM' }], {
      custom: true,
      source: 'custom'
    })

    actions.upsertTokens([{ ...testTokens.badger, symbol: 'REMOTE' }], { source: 'portfolio' })

    expect(getState().main.tokens.byId[toTokenId(testTokens.badger)].symbol).toBe('CUSTOM')
  })
})

describe('#removeCustomTokens', () => {
  it('clears the custom flag without deleting globally known metadata', () => {
    const stored = tokenRecord(testTokens.zrx, { custom: true })
    const { actions, getState } = createActionHarness({
      main: { tokens: tokenCatalog([stored], { [owner]: [toTokenId(stored)] }) }
    })

    actions.removeCustomTokens([testTokens.zrx])

    expect(getState().main.tokens.byId[toTokenId(stored)].custom).toBe(false)
    expect(tokensForAccount(getState().main.tokens, owner)).toHaveLength(1)
  })
})

describe('#initOrigin', () => {
  let actions: CanonicalActions
  let origins: any
  const creationDate = new Date('2022-05-24')

  const initOrigin = (id: any, origin: any) => actions.initOrigin(id, origin)

  beforeEach(() => {
    origins = {}
    setSystemTime(creationDate)
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
    setSystemTime(updateTime)

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

  it('deletes the network projections and redirects every affected origin to mainnet', () => {
    removeNetwork(4)

    expect({
      networks: main.networks.ethereum,
      metadata: main.networksMeta.ethereum,
      origins: main.origins
    }).toStrictEqual({
      networks: { 1: {}, 137: {} },
      metadata: { 1: {}, 137: {} },
      origins: {
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
      }
    })
  })

  describe('when passed the last network of a given type', () => {
    it('preserves the network projections and all origin assignments', () => {
      removeNetwork(50, 'cosmos')

      expect({
        network: main.networks.cosmos[50],
        metadata: main.networksMeta.cosmos[50],
        origins: main.origins
      }).toStrictEqual({
        network: {},
        metadata: {},
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

describe('#setNetworkImage', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      networksMeta: {
        ethereum: {
          1: {
            icon: '',
            nativeCurrency: {}
          },
          8453: {
            icon: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
            nativeCurrency: {}
          }
        }
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  const image = {
    base64: 'aWNvbg==',
    contentHash: 'hash',
    mimeType: 'image/png',
    sourceUrl: 'https://cdn.example/base.png'
  }

  it('should update the network image and source for the expected chain', () => {
    actions.setNetworkImage('ethereum', 8453, image.sourceUrl, image)

    expect(main.networksMeta.ethereum).toStrictEqual({
      1: { icon: '', nativeCurrency: {} },
      8453: {
        icon: image.sourceUrl,
        image,
        nativeCurrency: {}
      }
    })
  })

  it('should store a native currency image with its network metadata', () => {
    actions.setNativeCurrencyImage('ethereum', 1, image)

    expect(main.networksMeta.ethereum[1].nativeCurrency.image).toEqual(image)
  })
})

describe('#upsertAccount', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    setSystemTime(new Date('2022-11-17T11:01:58.135Z'))

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

  it('updates account-owned fields and metadata without accepting a balance overwrite', () => {
    setAccount('1', { name: 'cool account', lastSignerType: 'seed', status: 'ok', balances: 'ignored' })

    expect({ accounts: main.accounts, metadata: main.accountsMeta }).toStrictEqual({
      accounts: {
        1: {
          id: '1',
          profileId: DEFAULT_PROFILE_ID,
          name: 'cool account',
          lastSignerType: 'seed',
          status: 'ok',
          balances: {}
        }
      },
      metadata: {
        'e42ee170-4601-5428-bac5-d8d92fe049e8': {
          name: 'cool account',
          lastUpdated: 1668682918135
        }
      }
    })
  })

  it('creates a new account and its user-defined metadata together', () => {
    setAccount('2', { name: 'not so cool account', lastSignerType: 'seed', status: 'ok' })

    expect({ accounts: main.accounts, metadata: main.accountsMeta }).toStrictEqual({
      accounts: {
        1: {
          id: '1',
          profileId: DEFAULT_PROFILE_ID,
          name: 'cool account',
          lastSignerType: 'ledger',
          balances: {}
        },
        2: {
          id: '2',
          profileId: DEFAULT_PROFILE_ID,
          name: 'not so cool account',
          lastSignerType: 'seed',
          status: 'ok',
          balances: {}
        }
      },
      metadata: {
        'e42ee170-4601-5428-bac5-d8d92fe049e8': {
          name: 'cool account',
          lastUpdated: 1568682918135
        },
        '0d6c930e-3495-56cc-993f-8da3a6150003': {
          name: 'not so cool account',
          lastUpdated: 1668682918135
        }
      }
    })
  })

  it('does not persist generated default labels for new or existing accounts', () => {
    for (const id of ['1', '2']) {
      const { actions, getState } = createActionHarness({
        main: {
          accounts: main.accounts,
          accountsMeta: main.accountsMeta
        }
      })

      actions.upsertAccount({ id, name: 'hot account', lastSignerType: 'seed', status: 'ok' })

      expect(getState().main.accountsMeta).toStrictEqual({
        'e42ee170-4601-5428-bac5-d8d92fe049e8': {
          name: 'cool account',
          lastUpdated: 1568682918135
        }
      })
    }
  })
})

describe('profile actions', () => {
  const profileAccount = (id: string, profileId = DEFAULT_PROFILE_ID) => ({
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

  it('creates, renames, selects, and deletes profiles while keeping deterministic selection', () => {
    const harness = createActionHarness({
      main: {
        profiles: { [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' } },
        profileOrder: [DEFAULT_PROFILE_ID],
        currentProfile: DEFAULT_PROFILE_ID,
        currentAccount: 'one',
        accounts: {
          one: profileAccount('one')
        },
        accountOrder: ['one']
      }
    })

    harness.actions.createProfile('work', 'Work')
    harness.actions.upsertAccount(profileAccount('two', 'work'))
    harness.actions.createProfile('spare', 'Spare')
    harness.actions.renameProfile('work', 'Work Wallet')
    harness.actions.selectProfile('work')

    expect(harness.getState().main).toMatchObject({
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
        work: { id: 'work', name: 'Work Wallet' },
        spare: { id: 'spare', name: 'Spare' }
      },
      profileOrder: [DEFAULT_PROFILE_ID, 'work', 'spare'],
      currentProfile: 'work',
      currentAccount: 'two'
    })

    harness.actions.deleteProfile('work')
    expect(harness.getState().main.profileOrder).toEqual([DEFAULT_PROFILE_ID, 'work', 'spare'])

    harness.actions.moveAccountToProfile('two', DEFAULT_PROFILE_ID)
    expect(harness.getState().main.currentProfile).toBe('work')
    expect(harness.getState().main.currentAccount).toBe('')

    harness.actions.deleteProfile('work')
    expect(harness.getState().main).toMatchObject({
      profileOrder: [DEFAULT_PROFILE_ID, 'spare'],
      currentProfile: 'spare',
      currentAccount: ''
    })

    harness.actions.deleteProfile('spare')
    expect(harness.getState().main.currentProfile).toBe(DEFAULT_PROFILE_ID)
    expect(harness.getState().main.currentAccount).toBe('one')
    harness.actions.deleteProfile(DEFAULT_PROFILE_ID)
    expect(harness.getState().main.profileOrder).toEqual([DEFAULT_PROFILE_ID])
  })

  it('assigns new accounts to the selected profile and rejects invalid profile operations', () => {
    const harness = createActionHarness({
      main: {
        profiles: {
          [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
          work: { id: 'work', name: 'Work' }
        },
        profileOrder: [DEFAULT_PROFILE_ID, 'work'],
        currentProfile: 'work',
        currentAccount: ''
      }
    })

    const { profileId: _profileId, ...newAccount } = profileAccount('new')
    harness.actions.upsertAccount(newAccount)
    harness.actions.createProfile('', 'Invalid')
    harness.actions.createProfile('work', 'Duplicate')
    harness.actions.renameProfile('work', '')
    harness.actions.selectProfile('missing')
    harness.actions.moveAccountToProfile('new', 'missing')

    expect(harness.getState().main).toMatchObject({
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
        work: { id: 'work', name: 'Work' }
      },
      profileOrder: [DEFAULT_PROFILE_ID, 'work'],
      currentProfile: 'work',
      currentAccount: '',
      accounts: { new: { id: 'new', profileId: 'work' } }
    })
  })

  it('falls back by account order and then insertion order when membership changes or is removed', () => {
    const harness = createActionHarness({
      main: {
        profiles: {
          [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
          work: { id: 'work', name: 'Work' }
        },
        profileOrder: [DEFAULT_PROFILE_ID, 'work'],
        currentProfile: DEFAULT_PROFILE_ID,
        currentAccount: 'one',
        accounts: {
          one: profileAccount('one'),
          two: profileAccount('two'),
          three: profileAccount('three')
        },
        accountOrder: ['missing', 'three']
      }
    })

    harness.actions.moveAccountToProfile('one', 'work')
    expect(harness.getState().main.currentAccount).toBe('three')
    harness.actions.reorderAccounts('two', 'three')
    harness.actions.removeAccount('three')
    expect(harness.getState().main.currentAccount).toBe('two')
    harness.actions.removeAccount('two')
    expect(harness.getState().main.currentAccount).toBe('')
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
      name: 'Old Token',
      symbol: 'OLD',
      decimals: 18
    }

    main = {
      tokens: tokenCatalog(
        [
          tokenRecord(testTokens.zrx, { custom: true }),
          tokenRecord(testTokens.badger),
          tokenRecord(staleKnownToken)
        ],
        { [owner]: [toTokenId(testTokens.badger), toTokenId(staleKnownToken)] }
      ),
      balances: {
        [owner]: [
          { address: NATIVE_CURRENCY, chainId: 1, balance: '0x1', displayBalance: '' },
          {
            address: testTokens.zrx.address,
            chainId: testTokens.zrx.chainId,
            balance: '0x2',
            displayBalance: ''
          },
          {
            address: testTokens.badger.address,
            chainId: testTokens.badger.chainId,
            balance: '0x3',
            displayBalance: ''
          },
          {
            address: staleKnownToken.address,
            chainId: staleKnownToken.chainId,
            balance: '0x5',
            displayBalance: ''
          }
        ]
      }
    }
    actions = createActionHarness({ main }, (state) => {
      main = state.main
    }).actions
  })

  it('replaces cached portfolio balances without removing custom token balances', () => {
    const nativeBalance = { address: NATIVE_CURRENCY, chainId: 1, balance: '0x6', displayBalance: '' }
    const zerionBalance = { ...testTokens.badger, balance: '0x4' }

    setPortfolioBalances([nativeBalance, zerionBalance])

    expect(main.balances[owner]).toStrictEqual([
      {
        address: testTokens.zrx.address,
        chainId: testTokens.zrx.chainId,
        balance: '0x2',
        displayBalance: ''
      },
      nativeBalance,
      {
        address: testTokens.badger.address,
        chainId: testTokens.badger.chainId,
        balance: '0x4',
        displayBalance: ''
      }
    ])
  })
})

describe('#setAutoDiscoverTokens', () => {
  it('persists valid enable/disable transitions and rejects enabling without an API key', () => {
    const cases = [
      { initial: true, requested: false, apiKey: 'zk_test', expected: false },
      { initial: false, requested: true, apiKey: 'zk_test', expected: true },
      { initial: false, requested: true, apiKey: '', expected: false }
    ]

    for (const { initial, requested, apiKey, expected } of cases) {
      const { actions, getState } = createActionHarness({
        main: { autoDiscoverTokens: initial, portfolioApiKey: apiKey }
      })

      actions.setAutoDiscoverTokens(requested)

      expect(getState().main.autoDiscoverTokens).toBe(expected)
    }
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

describe('#removeAccountTokens', () => {
  it('removes exactly the requested account-token associations', () => {
    const records = Object.values(testTokens).map((token) => tokenRecord(token))
    const cases = [
      { removed: records.map(toTokenId), remaining: [] },
      { removed: [toTokenId(testTokens.badger)], remaining: [testTokens.zrx] }
    ]

    for (const { removed, remaining } of cases) {
      const catalog = tokenCatalog(records, { [owner]: records.map(toTokenId) })
      const { actions, getState } = createActionHarness({ main: { tokens: catalog } })

      actions.removeAccountTokens(owner, new Set(removed))

      expect(tokensForAccount(getState().main.tokens, owner)).toStrictEqual(
        remaining.map((token) => expect.objectContaining(token))
      )
    }
  })
})

describe('#resetSavedData', () => {
  let actions: CanonicalActions
  let main: any

  beforeEach(() => {
    main = {
      tokens: tokenCatalog([tokenRecord(testTokens.zrx, { custom: true }), tokenRecord(testTokens.badger)], {
        [owner]: [toTokenId(testTokens.zrx)],
        '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e': [toTokenId(testTokens.badger)]
      }),
      balances: {
        [owner]: [
          { address: testTokens.zrx.address, chainId: testTokens.zrx.chainId, balance: '0x1' },
          { address: testTokens.badger.address, chainId: testTokens.badger.chainId, balance: '0x2' }
        ],
        '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e': [
          { address: testTokens.badger.address, chainId: testTokens.badger.chainId, balance: '0x3' }
        ]
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

    expect(customTokens(main.tokens)).toEqual([expect.objectContaining(testTokens.zrx)])
    expect(main.tokens.accountTokenIds).toStrictEqual({})
    expect(main.balances[owner]).toStrictEqual([
      { address: testTokens.zrx.address, chainId: testTokens.zrx.chainId, balance: '0x1' }
    ])
    expect(main.balances['0xd0e3872f5fa8ecb49f1911f605c0da90689a484e']).toStrictEqual([])
    expect(main.activity).toStrictEqual({})
    expect(main.orders).toStrictEqual({})
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

    setSystemTime(submittedAt)
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

    setSystemTime(confirmingAt)
    updateActivity('tx-1', { status: 'confirming', confirmations: 2 })

    expect(activity['tx-1']).toEqual(
      expect.objectContaining({
        status: 'confirming',
        confirmations: 2,
        updatedAt: confirmingAt.getTime()
      })
    )

    setSystemTime(completedAt)
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

    setSystemTime(createdAt)
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

    setSystemTime(resolvedAt)
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

    setSystemTime(dismissedAt)
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
  it('allocates home-command identities independently for each fresh store', () => {
    const first = createActionHarness({})
    const second = createActionHarness({})

    first.actions.navHome({ view: 'tokens', data: { account: 'first' } })
    first.actions.navHome({ view: 'chains' })
    second.actions.navHome({ view: 'tokens', data: { account: 'second' } })

    expect({
      first: first.getState().tray.homeCommand,
      second: second.getState().tray.homeCommand
    } as unknown).toStrictEqual({
      first: { id: 2, view: 'networks', data: {} },
      second: { id: 1, view: 'tokens', data: { account: 'second' } }
    })
  })

  it('clears initial tray state independently for each fresh store', async () => {
    const first = createActionHarness({})
    const second = createActionHarness({})

    first.actions.trayOpen(true)
    second.actions.trayOpen(true)
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect([
      { initial: first.getState().tray.initial, open: first.getState().tray.open },
      { initial: second.getState().tray.initial, open: second.getState().tray.open }
    ]).toStrictEqual([
      { initial: false, open: true },
      { initial: false, open: true }
    ])
  })

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
        main: {
          profiles: { [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' } },
          profileOrder: [DEFAULT_PROFILE_ID],
          currentProfile: DEFAULT_PROFILE_ID,
          currentAccount: '',
          accounts: {
            'new-account': { id: 'new-account', profileId: DEFAULT_PROFILE_ID }
          },
          accountOrder: ['new-account']
        }
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
