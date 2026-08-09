import { createStore } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'

import { createCanonicalActions, type CanonicalStore } from '../../src/platform/state-store/actions'
import createInitialState from '../../src/platform/state-store/state'

export function createTestStore(
  initial: Record<string, any> = {},
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
  if (onChange) store.subscribe(onChange)

  return { actions: store.getState(), getState: store.getState, store }
}
