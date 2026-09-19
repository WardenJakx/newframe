import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'

import { createCanonicalActions, type CanonicalStore } from '../../src/platform/state-store/actions'
import createInitialState, { type CanonicalState } from '../../src/platform/state-store/state'

type TestInitialState = Partial<Omit<CanonicalState, 'main' | 'view' | 'windows'>> & {
  main?: Partial<CanonicalState['main']>
  view?: Partial<CanonicalState['view']>
  windows?: Partial<CanonicalState['windows']> & {
    panel?: Partial<CanonicalState['windows']['panel']>
  }
}

export function createTestStore(initial: TestInitialState = {}, onChange?: (state: CanonicalStore) => void) {
  const defaults = createInitialState()
  const data = {
    ...defaults,
    ...initial,
    windows: {
      ...defaults.windows,
      ...initial.windows,
      panel: {
        ...defaults.windows.panel,
        footer: { height: 40 },
        ...(initial.windows as { panel?: Record<string, unknown> } | undefined)?.panel
      }
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
