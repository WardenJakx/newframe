import type { RendererState } from '@newframe/schema/projection-stream'
import type { SideTrayRendererState, WalletRendererState } from '@newframe/schema/projections'
import type { ComponentType, PropsWithChildren } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { RendererStateProvider } from '../../src/trays/shared/projection/useAppSelector.tsx'

export interface RendererStateFixtureOptions {
  initialState?: RendererState
}

let installedRendererState: RendererStateStore | undefined

// Tests seed partial projections, so both typed views share one loosely typed store.
export function createRendererStateFixture({ initialState = {} }: RendererStateFixtureOptions = {}) {
  const store = createStore<RendererState>()(() => initialState)
  return {
    wallet: store as unknown as StoreApi<WalletRendererState>,
    sideTray: store as unknown as StoreApi<SideTrayRendererState>,
    getState: store.getState,
    reset: (state: RendererState = {}) => store.setState(state, true)
  }
}

export type RendererStateStore = ReturnType<typeof createRendererStateFixture>

export function createRendererStateWrapper(state: RendererStateStore): ComponentType<PropsWithChildren> {
  return function RendererStateTestWrapper({ children }: PropsWithChildren) {
    return <RendererStateProvider state={state}>{children}</RendererStateProvider>
  }
}

export function installRendererStateFixture(state: RendererStateStore) {
  const previous = installedRendererState
  installedRendererState = state
  return () => {
    if (installedRendererState === state) {
      installedRendererState = previous
    }
  }
}

export function getRendererStateFixtureForRender() {
  return installedRendererState ?? createRendererStateFixture()
}
