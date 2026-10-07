import type { ComponentType, PropsWithChildren } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type {
  SideTrayProjection,
  MainTrayProjection
} from '../../src/platform/state-sync/contract/projections.ts'
import type { TrayState } from '../../src/platform/state-sync/contract/protocol.ts'
import { TrayStateProvider } from '../../src/platform/state-sync/renderer/useAppSelector.tsx'
import { AddressNamesContext } from '../../src/shared/renderer/addressNames.tsx'

export interface TrayStateFixtureOptions {
  initialState?: TrayState
}

let installedTrayState: TrayStateStore | undefined

// Tests seed partial projections, so both typed views share one loosely typed store.
export function createTrayStateFixture({ initialState = {} }: TrayStateFixtureOptions = {}) {
  const store = createStore<TrayState>()(() => initialState)
  return {
    wallet: store as unknown as StoreApi<MainTrayProjection>,
    sideTray: store as unknown as StoreApi<SideTrayProjection>,
    getState: store.getState,
    reset: (state: TrayState = {}) => store.setState(state, true)
  }
}

export type TrayStateStore = ReturnType<typeof createTrayStateFixture>

const NO_ADDRESS_NAMES: MainTrayProjection['addressNames'] = {}

function FixtureAddressNames({ state, children }: PropsWithChildren<{ state: TrayStateStore }>) {
  const addressNames = useStore(
    state.wallet,
    (projection: Partial<MainTrayProjection>) => projection.addressNames ?? NO_ADDRESS_NAMES
  )
  return <AddressNamesContext.Provider value={addressNames}>{children}</AddressNamesContext.Provider>
}

export function createTrayStateWrapper(state: TrayStateStore): ComponentType<PropsWithChildren> {
  return function TrayStateTestWrapper({ children }: PropsWithChildren) {
    return (
      <TrayStateProvider state={state}>
        <FixtureAddressNames state={state}>{children}</FixtureAddressNames>
      </TrayStateProvider>
    )
  }
}

export function installTrayStateFixture(state: TrayStateStore) {
  const previous = installedTrayState
  installedTrayState = state
  return () => {
    if (installedTrayState === state) {
      installedTrayState = previous
    }
  }
}

export function getTrayStateFixtureForRender() {
  return installedTrayState ?? createTrayStateFixture()
}
