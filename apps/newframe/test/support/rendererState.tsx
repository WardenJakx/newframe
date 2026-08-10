import type { ComponentType, PropsWithChildren } from 'react'

import type { RendererProjection } from '../../src/platform/state-sync/contract/projections'
import type { RendererState } from '../../src/platform/state-sync/contract/protocol'
import {
  createRendererStateStore,
  type RendererStateStore
} from '../../src/platform/state-sync/renderer/rendererStore'
import { RendererStateProvider } from '../../src/platform/state-sync/renderer/useAppSelector'

export interface RendererStateFixtureOptions {
  initialState?: RendererState
  projection?: RendererProjection
}

let installedRendererState: RendererStateStore | undefined

export function createRendererStateFixture({
  initialState = {},
  projection
}: RendererStateFixtureOptions = {}) {
  const state = createRendererStateStore(initialState)
  if (projection) state.beginStateConnection(projection)
  return state
}

export function createRendererStateWrapper(state: RendererStateStore): ComponentType<PropsWithChildren> {
  return function RendererStateTestWrapper({ children }: PropsWithChildren) {
    return <RendererStateProvider state={state}>{children}</RendererStateProvider>
  }
}

export function installRendererStateFixture(state: RendererStateStore) {
  const previous = installedRendererState
  installedRendererState = state
  return () => {
    if (installedRendererState === state) installedRendererState = previous
  }
}

export function getRendererStateFixtureForRender() {
  return installedRendererState ?? createRendererStateFixture()
}
