import * as actualFs from 'node:fs'

const realFs = {
  mkdirSync: actualFs.mkdirSync.bind(actualFs),
  readFileSync: actualFs.readFileSync.bind(actualFs),
  writeFileSync: actualFs.writeFileSync.bind(actualFs),
  writeSync: actualFs.writeSync.bind(actualFs)
}
const logMock = { info: console.log, error: jest.fn() }
const persistDir = '/private/tmp/frame-state-test'
const persistFile = `${persistDir}/config.json`
const electronMock = { app: { on: jest.fn(), getPath: jest.fn(() => persistDir) } }
let writtenData: any

const fsMock = {
  ...actualFs,
  __getWrittenData: () => writtenData,
  writeSync: (...args: any[]) => {
    writtenData = args[1]
    return (realFs.writeSync as any)(...args)
  },
  writeFileSync: (...args: any[]) => {
    writtenData = args[1]
    return realFs.writeFileSync(...(args as [any, any]))
  },
  readFileSync: (...args: any[]) => {
    const path = args[0]
    if (typeof path === 'string' && path.includes('config.json')) {
      return JSON.stringify({
        main: {
          __: {
            1: {
              main: {
                _version: 1,
                instanceId: 'test-frame'
              }
            }
          }
        }
      })
    }

    return realFs.readFileSync(...(args as [any]))
  }
}

jest.mock('electron-log', () => ({ default: logMock, ...logMock }))
jest.mock('electron', () => ({ default: electronMock, ...electronMock }))
jest.mock('fs', () => ({ default: fsMock, ...fsMock }))

let mockLatestVersion = 0
let mockVersionedMainState: any = {}
let importCounter = 0

const loadState = async () => {
  const { default: state } = await import(`../../../../main/store/state?test=${importCounter++}`)
  return state
}

jest.mock('../../../../main/store/migrate', () => {
  const migrateMock = {
    get latest() {
      return mockLatestVersion
    },
    apply: (state: any) => {
      return mockLatestVersion === 2
        ? { ...state, main: { ...state.main, _version: 2, instanceId: 'test-brand-new-frame' } }
        : { ...state }
    }
  }

  return { default: migrateMock, ...migrateMock }
})

jest.mock('../../../../main/store/persist', () => {
  const get = (path: any) => {
    if (path === 'main')
      // simulate state that has already been migrated to version 2
      return {
        __: {
          1: {
            main: {
              _version: 1,
              instanceId: 'test-frame',
              ...mockVersionedMainState[1]
            }
          },
          2: {
            main: {
              _version: 2,
              instanceId: 'test-brand-new-frame',
              ...mockVersionedMainState[2]
            }
          }
        }
      }
  }

  const persistMock = { get }

  return { default: persistMock, ...persistMock }
})

afterEach(() => {
  mockVersionedMainState = {}
  writtenData = undefined
})

it('maintains backwards compatible access to the current version of state', async () => {
  // load state already migrated to version 2 and make sure version 1 values are available
  mockLatestVersion = 1

  const state = await loadState()

  expect(state().main.instanceId).toBe('test-frame')
})

it('loads values from the current version of the state', async () => {
  // load state migrated to version 2 and make sure version 2 value is the one that's read
  mockLatestVersion = 2

  const state = await loadState()

  expect(state().main.instanceId).toBe('test-brand-new-frame')
})

it('disables token auto-discovery by default', async () => {
  mockLatestVersion = 2

  const state = await loadState()

  expect(state().main.autoDiscoverTokens).toBe(false)
  expect(state().main.portfolioApiKey).toBe('')
})

it('requires a portfolio API key for persisted token auto-discovery', async () => {
  mockLatestVersion = 2
  mockVersionedMainState[2] = { autoDiscoverTokens: true }

  const state = await loadState()

  expect(state().main.autoDiscoverTokens).toBe(false)
})

it('preserves persisted token auto-discovery when a portfolio API key exists', async () => {
  mockLatestVersion = 2
  mockVersionedMainState[2] = { autoDiscoverTokens: true, portfolioApiKey: 'zk_test' }

  const state = await loadState()

  expect(state().main.autoDiscoverTokens).toBe(true)
  expect(state().main.portfolioApiKey).toBe('zk_test')
})

it('hides testnets by default', async () => {
  mockLatestVersion = 2

  const state = await loadState()

  expect(state().main.showTestnets).toBe(false)
})

it('enables only the supported production networks by default', async () => {
  mockLatestVersion = 2

  const state = await loadState()

  const networks = state().main.networks.ethereum
  const enabledChainIds = Object.values(networks)
    .filter((network: any) => network.on)
    .map((network: any) => network.id)
    .sort((a, b) => a - b)

  expect(enabledChainIds).toEqual([1, 10, 56, 137, 999, 8453, 42161, 43114])
})

it('normalizes persisted network state to the supported production networks', async () => {
  mockLatestVersion = 2

  const oldNetwork = (id: number, name: string, on: boolean) => ({
    id,
    type: 'ethereum',
    name,
    on,
    connection: {
      primary: {
        on: id === 1,
        current: 'pylon',
        status: 'loading',
        connected: false,
        type: '',
        network: '',
        custom: ''
      },
      secondary: {
        on: false,
        current: 'custom',
        status: 'loading',
        connected: false,
        type: '',
        network: '',
        custom: ''
      }
    }
  })

  mockVersionedMainState[2] = {
    networks: {
      ethereum: {
        1: oldNetwork(1, 'Mainnet', true),
        10: oldNetwork(10, 'Optimism', false),
        100: oldNetwork(100, 'Gnosis', false),
        137: oldNetwork(137, 'Polygon', false),
        8453: oldNetwork(8453, 'Base', false),
        42161: oldNetwork(42161, 'Arbitrum', false),
        84532: oldNetwork(84532, 'Base Sepolia', false),
        11155111: oldNetwork(11155111, 'Sepolia', false),
        11155420: oldNetwork(11155420, 'Optimism Sepolia', false)
      }
    }
  }

  const state = await loadState()

  const networks = state().main.networks.ethereum
  const enabledChainIds = Object.values(networks)
    .filter((network: any) => network.on)
    .map((network: any) => network.id)
    .sort((a, b) => a - b)

  expect(enabledChainIds).toEqual([1, 10, 56, 137, 999, 8453, 42161, 43114])
  expect(networks[56].connection.primary.custom).toBe('https://bsc-dataseed.bnbchain.org')
  expect(networks[999].connection.primary.custom).toBe('https://rpc.hyperliquid.xyz/evm')
  expect(networks[43114].connection.primary.custom).toBe('https://api.avax.network/ext/bc/C/rpc')
  expect(networks[1].connection.primary.current).toBe('chainlist')
  expect(networks[137].connection.primary.current).toBe('chainlist')
  expect(networks[10].connection.primary.on).toBe(true)
  expect(networks[100].on).toBe(false)
})

it('hydrates the selected account from the persisted current account', async () => {
  mockLatestVersion = 2
  mockVersionedMainState[2] = {
    currentAccount: '0xselected',
    accounts: {
      '0xfirst': { id: '0xfirst', address: '0xfirst', active: true },
      '0xselected': { id: '0xselected', address: '0xselected' }
    },
    accountOrder: ['0xfirst', '0xselected']
  }

  const state = await loadState()

  expect(state().selected.current).toBe('0xselected')
})

it('falls back to a persisted active account when no current account was saved', async () => {
  mockLatestVersion = 2
  mockVersionedMainState[2] = {
    accounts: {
      '0xfirst': { id: '0xfirst', address: '0xfirst' },
      '0xactive': { id: '0xactive', address: '0xactive', active: true }
    },
    accountOrder: ['0xfirst', '0xactive']
  }

  const state = await loadState()

  expect(state().selected.current).toBe('0xactive')
})

it('drops persisted disconnected dapp permission entries', async () => {
  mockLatestVersion = 2
  mockVersionedMainState[2] = {
    accounts: {
      '0xabc': { id: '0xabc', address: '0xabc', active: true }
    },
    permissions: {
      '0xabc': {
        connected: { handlerId: 'connected', origin: 'connected.test', provider: true },
        disconnected: { handlerId: 'disconnected', origin: 'disconnected.test', provider: false }
      }
    }
  }

  const state = await loadState()

  expect(state().main.permissions['0xabc']).toEqual({
    connected: { handlerId: 'connected', origin: 'connected.test', provider: true }
  })
})

it('preserves an older version of the state after creating a newer state entry', async () => {
  mockLatestVersion = 2

  realFs.mkdirSync(persistDir, { recursive: true })
  realFs.writeFileSync(
    persistFile,
    JSON.stringify({
      main: {
        __: {
          1: {
            main: {
              _version: 1,
              instanceId: 'test-frame'
            }
          }
        }
      }
    })
  )

  const { default: persist } = await import(`../../../../main/store/persist/index?test=${importCounter++}`)
  const state = await loadState()

  persist.set('main', state().main)

  const writtenState = JSON.parse(realFs.readFileSync(persistFile, 'utf8'))

  expect(writtenState.main.__['1'].main.instanceId).toBe('test-frame')
  expect(writtenState.main.__['2'].main.instanceId).toBe('test-brand-new-frame')
}, 500)
