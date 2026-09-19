import { mock } from 'bun:test'

import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'

import {
  createCanonicalActions,
  type CanonicalActions,
  type CanonicalStore
} from '../../src/platform/state-store/actions'
import type { CanonicalGet, CanonicalSet } from '../../src/platform/state-store/actions.panel'
import createInitialState from '../../src/platform/state-store/state'

const defaultState = () =>
  Object.assign(createInitialState(), {
    operations: {},
    platform: process.platform,
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

let actionImplementations = {} as CanonicalActions
let actionMocks: Record<string, ReturnType<typeof mock>> = {}

const createMockActions = (set: CanonicalSet, get: CanonicalGet) => {
  actionImplementations = createCanonicalActions(set, get)
  actionMocks = Object.fromEntries(
    (Object.keys(actionImplementations) as Array<keyof CanonicalActions>).map((name) => [
      name,
      mock((...args: unknown[]) => Reflect.apply(actionImplementations[name], undefined, args))
    ])
  )

  return Object.assign({}, actionImplementations, actionMocks)
}

export const storeMock = createStore<CanonicalStore>()(
  subscribeWithSelector(
    immer((set, get) => {
      const actions = createMockActions((update) => set(update), get)
      return { ...defaultState(), ...actions }
    })
  )
)

export const resetStoreState = () => {
  const actions = Object.assign({}, actionImplementations, actionMocks)
  storeMock.setState({ ...defaultState(), ...actions }, true)
}
