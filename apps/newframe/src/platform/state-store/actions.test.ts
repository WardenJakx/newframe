import { afterAll, afterEach, beforeAll, describe, expect, it, jest as timers, setSystemTime } from 'bun:test'

import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'

import createInitialState from './state'
import { NATIVE_CURRENCY } from '../../features/tokens/domain/constants'
import { toTokenId } from '../../features/asset-data/domain/balance'
import { customTokens, tokensForAccount } from '../../features/tokens/domain'
import { DEFAULT_PROFILE_ID } from '../../app/contracts/state/main'
import { createTestStore as createActionHarness } from '../../../test/support/createTestStore'

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

afterEach(() => timers.useRealTimers())

const owner = '0xa8be0f701d0f37088600164e71bffc0ad652c251'
const otherOwner = '0xd0e3872f5fa8ecb49f1911f605c0da90689a484e'
const originIds = {
  first: '91f6971d-ba85-52d7-a27e-6af206eb2433',
  second: '8073729a-5e59-53b7-9e69-5d9bcff94087',
  third: 'd7acc008-6411-5486-bb2d-0c0cfcddbb92',
  fourth: '695112ec-43e2-52a8-8f69-5c36837d6d13'
}

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

const storedBalance = (token: { address: string; chainId: number }, balance: string) => ({
  address: token.address,
  chainId: token.chainId,
  balance,
  displayBalance: ''
})

describe('#addNetwork', () => {
  const polygonNetwork = {
    id: 123456,
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
      id: '123456',
      icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg',
      primaryRpc: 'https://polygon-rpc.com',
      secondaryRpc: 'https://rpc-mainnet.matic.network'
    })

    expect({
      network: getState().main.networks.ethereum['123456'],
      metadata: getState().main.networksMeta.ethereum['123456']
    } as unknown).toStrictEqual({
      network: {
        id: 123456,
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
        icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg',
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
        networks: createInitialState().main.networks,
        metadata: createInitialState().main.networksMeta
      })
    }
  })

  it('preserves the existing network and metadata when the id already exists', () => {
    const existingMetadata = { name: 'Polygon metadata' }
    const { actions, getState } = createActionHarness({
      main: {
        networks: { ethereum: { '123456': polygonNetwork } },
        networksMeta: { ethereum: { '123456': existingMetadata } }
      }
    })

    actions.addNetwork({
      id: 123456,
      type: 'ethereum',
      name: 'Matic v1',
      explorer: 'https://rpc-mainnet.maticvigil.com',
      symbol: 'MATIC'
    })

    expect({
      network: getState().main.networks.ethereum['123456'],
      metadata: getState().main.networksMeta.ethereum['123456']
    } as unknown).toStrictEqual({ network: polygonNetwork, metadata: existingMetadata })
  })
})

describe('#setBalances', () => {
  it('merges new balances and replaces existing positive and zero amounts', () => {
    const zrxAmount = addHexPrefix(BigInt(79832332).toString(16))
    const badgerAmount = addHexPrefix(BigInt(419).toString(16))
    const { actions, getState } = createActionHarness({
      main: {
        balances: { [owner]: [{ ...testTokens.badger, balance: addHexPrefix(BigInt(305).toString(16)) }] }
      }
    })

    actions.setBalances(owner, [
      { ...testTokens.zrx, balance: zrxAmount },
      { ...testTokens.badger, balance: badgerAmount }
    ])
    expect(getState().main.balances[owner]).toStrictEqual([
      storedBalance(testTokens.zrx, zrxAmount),
      storedBalance(testTokens.badger, badgerAmount)
    ])

    actions.setBalances(owner, [storedBalance(testTokens.badger, '0x0')])
    expect(getState().main.balances[owner]).toStrictEqual([
      storedBalance(testTokens.zrx, zrxAmount),
      storedBalance(testTokens.badger, '0x0')
    ])
  })
})

describe('#removeBalance', () => {
  it('removes a balance from all accounts', () => {
    const balances = Object.fromEntries(
      [owner, otherOwner].map((account, index) => [
        account,
        [
          { ...testTokens.zrx, balance: addHexPrefix(BigInt(798564 + index).toString(16)) },
          { ...testTokens.badger, balance: addHexPrefix(BigInt(15543 + index).toString(16)) }
        ]
      ])
    )
    const { actions, getState } = createActionHarness({ main: { balances } })

    actions.removeBalance(1, testTokens.zrx.address)

    for (const account of [owner, otherOwner]) {
      expect(getState().main.balances[account]).toHaveLength(1)
      expect(getState().main.balances[account]).not.toContainEqual(
        expect.objectContaining({ address: testTokens.zrx.address })
      )
    }
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

describe('#clearOrigins', () => {
  it('should clear all existing origins and attached permissions', () => {
    const { actions, getState } = createActionHarness({
      main: {
        origins: { [originIds.first]: {}, [originIds.second]: {}, [originIds.third]: {} },
        permissions: {
          '0xabc': { [originIds.first]: { origin: 'frame.test', provider: true } }
        }
      }
    })
    actions.clearOrigins()

    expect(getState().main.origins).toEqual({})
    expect(getState().main.permissions).toEqual({})
  })
})

describe('#revokePermission', () => {
  it('removes the permission entry instead of disabling it', () => {
    const keepPermission = { origin: 'keep.test', provider: true, handlerId: originIds.third }
    const { actions, getState } = createActionHarness({
      main: {
        permissions: {
          '0xabc': {
            [originIds.second]: { origin: 'frame.test', provider: true, handlerId: originIds.second },
            [originIds.third]: keepPermission
          }
        }
      }
    })
    actions.revokePermission('0xabc', originIds.second)

    expect(getState().main.permissions).toEqual({ '0xabc': { [originIds.third]: keepPermission } })
  })
})

describe('#removeOrigin', () => {
  it('should remove the specified origin and attached permissions', () => {
    const keepPermission = { origin: 'keep.test', provider: true, handlerId: originIds.third }
    const origin = (id: number) => ({
      name: 'frame.test',
      chain: { id, type: 'ethereum' as const },
      session: { requests: 1, startedAt: 1, lastUpdatedAt: 1 }
    })
    const { actions, getState } = createActionHarness({
      main: {
        origins: {
          [originIds.first]: origin(1),
          [originIds.second]: origin(10),
          [originIds.third]: origin(137)
        },
        permissions: {
          '0xabc': {
            [originIds.second]: { origin: 'frame.test', provider: true, handlerId: originIds.second },
            [originIds.third]: keepPermission
          }
        }
      }
    })
    actions.removeOrigin(originIds.second)

    expect(getState().main.origins).toEqual({
      [originIds.first]: origin(1),
      [originIds.third]: origin(137)
    })
    expect(getState().main.permissions).toEqual({ '0xabc': { [originIds.third]: keepPermission } })
  })
})

describe('#addOriginRequest', () => {
  const creationTime = new Date('2022-05-24').getTime()
  const day = 1000 * 60 * 60 * 24
  const updateTime = creationTime + day * 2

  const createHarness = () => {
    setSystemTime(updateTime)
    return createActionHarness({
      main: {
        origins: {
          activeOrigin: {
            chain: { id: 10, type: 'ethereum' },
            session: { requests: 3, startedAt: creationTime, lastUpdatedAt: creationTime }
          },
          staleOrigin: {
            chain: { id: 42161, type: 'ethereum' },
            session: {
              requests: 14,
              startedAt: creationTime,
              endedAt: creationTime + day,
              lastUpdatedAt: creationTime + day
            }
          }
        }
      }
    })
  }

  it('updates an active session and restarts a previously ended session', () => {
    const { actions, getState } = createHarness()

    actions.addOriginRequest('activeOrigin')
    actions.addOriginRequest('staleOrigin')

    expect(getState().main.origins.activeOrigin.session).toEqual({
      requests: 4,
      startedAt: creationTime,
      lastUpdatedAt: updateTime
    })
    expect(getState().main.origins.staleOrigin.session).toEqual({
      requests: 1,
      startedAt: updateTime,
      lastUpdatedAt: updateTime
    })
  })
})

describe('#removeNetwork', () => {
  const origin = (id: number) => ({
    name: 'frame.test',
    chain: { id, type: 'ethereum' as const },
    session: { requests: 1, startedAt: 1, lastUpdatedAt: 1 }
  })
  const createHarness = () =>
    createActionHarness({
      main: {
        origins: {
          [originIds.first]: origin(1),
          [originIds.second]: origin(10),
          [originIds.third]: origin(137),
          [originIds.fourth]: origin(10)
        }
      }
    })

  it('deletes the network projections and redirects every affected origin to mainnet', () => {
    const { actions, getState } = createHarness()
    actions.removeNetwork({ id: 10, type: 'ethereum' })
    const main = getState().main

    expect(main.networks.ethereum[10]).toBeUndefined()
    expect(main.networksMeta.ethereum[10]).toBeUndefined()
    expect(Object.values(main.origins).map(({ chain }: any) => chain)).toStrictEqual([
      { id: 1, type: 'ethereum' },
      { id: 1, type: 'ethereum' },
      { id: 137, type: 'ethereum' },
      { id: 1, type: 'ethereum' }
    ])
  })
})

describe('#activateNetwork', () => {
  it('activates the given chain and redirects its origins when deactivated', () => {
    const { actions, getState } = createActionHarness({
      main: {
        networks: { ethereum: { 137: { on: false } } },
        origins: { 'frame.test': { chain: { id: 137 } } }
      }
    })

    actions.activateNetwork('ethereum', 137, true)
    expect(getState().main.networks.ethereum[137].on).toBe(true)
    actions.activateNetwork('ethereum', 137, false)
    expect(getState().main.origins['frame.test'].chain.id).toBe(1)
  })
})

describe('#upsertAccount', () => {
  const metadataId = 'e42ee170-4601-5428-bac5-d8d92fe049e8'
  const createHarness = () => {
    setSystemTime(new Date('2022-11-17T11:01:58.135Z'))
    return createActionHarness({
      main: {
        accounts: {
          1: { id: '1', name: 'cool account', lastSignerType: 'ledger', balances: {} }
        },
        accountsMeta: {
          [metadataId]: { name: 'cool account', lastUpdated: 1568682918135 }
        }
      }
    })
  }

  it('updates account-owned fields and metadata without accepting a balance overwrite', () => {
    const { actions, getState } = createHarness()
    actions.upsertAccount({
      id: '1',
      name: 'cool account',
      lastSignerType: 'seed',
      status: 'ok',
      balances: 'ignored'
    })

    expect(getState().main.accounts[1]).toMatchObject({
      id: '1',
      profileId: DEFAULT_PROFILE_ID,
      name: 'cool account',
      lastSignerType: 'seed',
      status: 'ok'
    })
    expect(getState().main.accounts[1]).toHaveProperty('balances', {})
    expect(getState().main.accountsMeta[metadataId]).toStrictEqual({
      name: 'cool account',
      lastUpdated: 1668682918135
    })
  })

  it('creates a new account and its user-defined metadata together', () => {
    const { actions, getState } = createHarness()
    actions.upsertAccount({ id: '2', name: 'not so cool account', lastSignerType: 'seed', status: 'ok' })

    expect(getState().main.accounts[2]).toMatchObject({
      id: '2',
      profileId: DEFAULT_PROFILE_ID,
      name: 'not so cool account',
      lastSignerType: 'seed',
      status: 'ok'
    })
    expect(getState().main.accounts[2]).toHaveProperty('balances', {})
    expect(getState().main.accountsMeta).toStrictEqual({
      [metadataId]: { name: 'cool account', lastUpdated: 1568682918135 },
      '0d6c930e-3495-56cc-993f-8da3a6150003': {
        name: 'not so cool account',
        lastUpdated: 1668682918135
      }
    })
  })

  it('does not persist generated default labels for new or existing accounts', () => {
    for (const id of ['1', '2']) {
      const { actions, getState } = createHarness()

      actions.upsertAccount({ id, name: 'hot account', lastSignerType: 'seed', status: 'ok' })

      expect(getState().main.accountsMeta).toStrictEqual({
        [metadataId]: { name: 'cool account', lastUpdated: 1568682918135 }
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

    const operationOwner = { clientType: 'wallet-ui', windowInstanceId: 'window-1' } as const
    const pendingOperation = {
      id: 'operation-1',
      type: 'transaction.submit',
      status: 'pending' as const,
      startedAt: 10,
      updatedAt: 10
    }
    harness.actions.operationStarted(operationOwner, pendingOperation)
    const succeededOperation = {
      ...pendingOperation,
      status: 'succeeded' as const,
      updatedAt: 20,
      finishedAt: 20
    }
    harness.actions.operationCompleted(pendingOperation.id, succeededOperation)
    expect(harness.getState().operations[pendingOperation.id]).toEqual({
      owner: operationOwner,
      operation: succeededOperation
    })
    harness.actions.operationsEvicted([pendingOperation.id])
    expect(harness.getState().operations).toEqual({})
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
  const staleToken = {
    chainId: 42161,
    address: '0x1111111111111111111111111111111111111111',
    name: 'Old Token',
    symbol: 'OLD',
    decimals: 18
  }

  it('replaces cached portfolio balances without removing custom token balances', () => {
    const nativeBalance = { address: NATIVE_CURRENCY, chainId: 1, balance: '0x6', displayBalance: '' }
    const zerionBalance = { ...testTokens.badger, balance: '0x4' }
    const { actions, getState } = createActionHarness({
      main: {
        tokens: tokenCatalog(
          [
            tokenRecord(testTokens.zrx, { custom: true }),
            tokenRecord(testTokens.badger),
            tokenRecord(staleToken)
          ],
          { [owner]: [toTokenId(testTokens.badger), toTokenId(staleToken)] }
        ),
        balances: {
          [owner]: [
            storedBalance({ address: NATIVE_CURRENCY, chainId: 1 }, '0x1'),
            storedBalance(testTokens.zrx, '0x2'),
            storedBalance(testTokens.badger, '0x3'),
            storedBalance(staleToken, '0x5')
          ]
        }
      }
    })

    actions.setPortfolioBalances(owner, [nativeBalance, zerionBalance])

    expect(getState().main.balances[owner]).toStrictEqual([
      storedBalance(testTokens.zrx, '0x2'),
      nativeBalance,
      storedBalance(testTokens.badger, '0x4')
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
  it('normalizes keys and disables discovery when a key is cleared', () => {
    for (const [value, key, autoDiscoverTokens] of [
      [' zk_test \n', 'zk_test', true],
      ['', '', false]
    ] as const) {
      const { actions, getState } = createActionHarness({
        main: { portfolioApiKey: '', autoDiscoverTokens: true }
      })
      actions.setPortfolioApiKey(value)
      expect([getState().main.portfolioApiKey, getState().main.autoDiscoverTokens]).toEqual([
        key,
        autoDiscoverTokens
      ])
    }
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
  it('clears cached known tokens, their balances, activity, and orders without removing custom tokens', () => {
    const { actions, getState } = createActionHarness({
      main: {
        tokens: tokenCatalog(
          [tokenRecord(testTokens.zrx, { custom: true }), tokenRecord(testTokens.badger)],
          {
            [owner]: [toTokenId(testTokens.zrx)],
            [otherOwner]: [toTokenId(testTokens.badger)]
          }
        ),
        balances: {
          [owner]: [storedBalance(testTokens.zrx, '0x1'), storedBalance(testTokens.badger, '0x2')],
          [otherOwner]: [storedBalance(testTokens.badger, '0x3')]
        },
        activity: { '0xabc': { id: '0xabc', hash: '0xabc', status: 'succeeded' } },
        orders: { 'order-1': { orderId: 'order-1', status: 'open' } }
      }
    })
    actions.resetSavedData()
    const main = getState().main

    expect(customTokens(main.tokens)).toEqual([expect.objectContaining(testTokens.zrx)])
    expect(main.tokens.accountTokenIds).toStrictEqual({})
    expect(main.balances[owner]).toStrictEqual([storedBalance(testTokens.zrx, '0x1')])
    expect(main.balances[otherOwner]).toStrictEqual([])
    expect(main.activity).toStrictEqual({})
    expect(main.orders).toStrictEqual({})
  })
})

describe('#navClearReq', () => {
  it('should remove a specific request from the nav', () => {
    const nav = [
      { view: 'requestView', data: { requestId: '1a' } },
      { view: 'requestView', data: { requestId: '2b' } },
      { view: 'expandedModule', data: { id: 'requests' } }
    ]
    const [req1, , inbox] = nav
    const { actions, getState } = createActionHarness({ windows: { panel: { nav } } })

    actions.navClearReq('2b', true)

    expect(getState().windows.panel.nav).toStrictEqual([req1, inbox])
  })

  it('should remove the request inbox when not requested', () => {
    const nav = [
      { view: 'requestView', data: { requestId: '1c' } },
      { view: 'expandedModule', data: { id: 'requests' } }
    ]
    const { actions, getState } = createActionHarness({ windows: { panel: { nav } } })

    actions.navClearReq('1c', false)

    expect(getState().windows.panel.nav).toStrictEqual([])
  })
})

describe('#activity actions', () => {
  it('tracks a transaction activity lifecycle', () => {
    const submittedAt = new Date('2024-01-01T00:00:00.000Z')
    const confirmingAt = new Date('2024-01-01T00:01:00.000Z')
    const completedAt = new Date('2024-01-01T00:02:00.000Z')
    const { actions, getState } = createActionHarness({ main: { activity: {} } })

    setSystemTime(submittedAt)
    actions.upsertSubmittedActivity({
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

    expect(getState().main.activity['tx-1']).toEqual({
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
    actions.updateActivity('tx-1', { status: 'confirming', confirmations: 2 })

    expect(getState().main.activity['tx-1']).toEqual(
      expect.objectContaining({
        status: 'confirming',
        confirmations: 2,
        updatedAt: confirmingAt.getTime()
      })
    )

    setSystemTime(completedAt)
    actions.finalizeActivity('tx-1', 'succeeded', { receipt: { status: '0x1' } })

    expect(getState().main.activity['tx-1']).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        completedAt: completedAt.getTime(),
        updatedAt: completedAt.getTime(),
        receipt: { status: '0x1' }
      })
    )

    actions.pruneActivity('tx-1')

    expect(getState().main.activity).toEqual({})
  })
})

describe('#status notification actions', () => {
  it('tracks a transient status notification lifecycle', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z')
    const resolvedAt = new Date('2024-01-01T00:01:00.000Z')
    const dismissedAt = new Date('2024-01-01T00:02:00.000Z')
    const expiresAt = resolvedAt.getTime() + 5000
    const { actions, getState } = createActionHarness({ view: { notifications: {} } })

    setSystemTime(createdAt)
    actions.upsertPendingNotification({
      id: 'notification-1',
      title: 'Transaction submitted',
      detail: 'Waiting for confirmation',
      target: { activityId: 'tx-1' }
    })

    expect(getState().view.notifications['notification-1']).toEqual({
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
    actions.resolveNotification('notification-1', 'completed', {
      detail: 'Confirmed',
      expiresAt
    })

    expect(getState().view.notifications['notification-1']).toEqual(
      expect.objectContaining({
        state: 'completed',
        detail: 'Confirmed',
        expiresAt,
        updatedAt: resolvedAt.getTime()
      })
    )

    setSystemTime(dismissedAt)
    actions.dismissNotification('notification-1')

    expect(getState().view.notifications['notification-1']).toEqual(
      expect.objectContaining({
        hidden: true,
        dismissedAt: dismissedAt.getTime(),
        updatedAt: dismissedAt.getTime()
      })
    )

    actions.expireNotification('notification-1')

    expect(getState().view.notifications).toEqual({})
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

  it('clears initial tray state independently for each fresh store', () => {
    timers.useFakeTimers()
    const first = createActionHarness({})
    const second = createActionHarness({})

    first.actions.trayOpen(true)
    second.actions.trayOpen(true)
    timers.advanceTimersByTime(30)

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
