import { createStore, type StoreApi } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'

import { createCanonicalActions, type CanonicalActions, type CanonicalStore } from '../../main/store/actions'

export function createTestStore(
  initial: Record<string, any> = {},
  onChange?: (state: CanonicalStore) => void
): {
  actions: CanonicalActions
  getState: () => CanonicalStore
  store: StoreApi<CanonicalStore>
} {
  const defaults: any = {
    windows: {
      panel: { nav: [], footer: { height: 40 } }
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
      assetRates: {},
      activity: {},
      orders: {},
      tokens: { byId: {}, accountTokenIds: {} },
      scanning: {}
    }
  }
  const data = {
    ...defaults,
    ...initial,
    windows: {
      ...defaults.windows,
      ...initial.windows,
      panel: { ...defaults.windows.panel, ...initial.windows?.panel }
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

  return { actions: store.getState(), getState: store.getState, store }
}
