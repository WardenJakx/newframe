import { mock } from 'bun:test'

import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'

import { createCanonicalActions } from '../../src/platform/state-store/actions'

const defaultState = () => ({
  main: {
    accounts: {},
    accountOrder: [],
    accountsMeta: {},
    activity: {},
    balances: {},
    currentAccount: '',
    knownExtensions: {},
    lattice: {},
    latticeSettings: {
      accountLimit: 5,
      derivation: 'standard',
      endpointMode: 'default',
      endpointCustom: ''
    },
    ledger: {
      derivation: 'live',
      liveAccountLimit: 5
    },
    trezor: {
      derivation: 'standard'
    },
    networks: { ethereum: {} },
    networksMeta: {
      ethereum: {
        1: {
          gas: {
            samples: [],
            price: {
              selected: 'standard',
              levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
            }
          },
          nativeCurrency: {
            symbol: 'ETH',
            icon: '',
            name: 'Ether',
            decimals: 18
          },
          icon: '',
          primaryColor: 'accent1'
        }
      }
    },
    orders: {},
    origins: {},
    permissions: {},
    portfolioApiKey: '',
    autoDiscoverTokens: false,
    assetRates: {},
    signers: {},
    tokens: {
      byId: {},
      accountTokenIds: {}
    },
    updater: {
      dontRemind: [],
      lastChecked: 0
    }
  },
  selected: {
    minimized: false,
    open: false
  },
  tray: {
    open: false,
    initial: true,
    homeCommand: null
  },
  view: {
    badge: '',
    notifications: {},
    notify: '',
    notifyData: {}
  },
  windows: {
    panel: {
      nav: [],
      show: false
    }
  }
})

let actionImplementations: Record<string, (...args: any[]) => any> = {}
let actionMocks: Record<string, ReturnType<typeof mock>> = {}

const createMockActions = (set: any, get: any) => {
  actionImplementations = createCanonicalActions(set, get) as Record<string, (...args: any[]) => any>
  actionMocks = Object.fromEntries(
    Object.entries(actionImplementations).map(([name, action]) => [
      name,
      mock((...args: any[]) => action(...args))
    ])
  )

  return actionMocks
}

export const storeMock = createStore<any>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...defaultState(),
      ...createMockActions(set, get)
    }))
  )
)

export const resetStoreState = () => {
  storeMock.setState({ ...defaultState(), ...actionMocks }, true)
}
