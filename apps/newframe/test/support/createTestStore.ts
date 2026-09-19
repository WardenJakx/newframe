import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'

import { createCanonicalActions, type CanonicalStore } from '../../src/platform/state-store/actions'
import createInitialState from '../../src/platform/state-store/state'

type TestStateOverrides = Record<string, unknown> & {
  main?: Record<string, unknown>
  view?: Record<string, unknown>
  windows?: Record<string, unknown> & {
    panel?: Record<string, unknown>
  }
}

export function createTestStore(
  initial: TestStateOverrides = {},
  onChange?: (state: CanonicalStore) => void
) {
  const defaults = createInitialState()
  const data = {
    ...defaults,
    ...initial,
    windows: {
      ...defaults.windows,
      ...initial.windows,
      panel: { ...defaults.windows.panel, footer: { height: 40 }, ...initial.windows?.panel }
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
  if (onChange) {
    store.subscribe(onChange)
  }

  return { actions: store.getState(), getState: store.getState, store }
}
