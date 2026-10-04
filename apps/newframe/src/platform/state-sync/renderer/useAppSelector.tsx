import { createContext, type ReactNode, useContext } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'

import type { SideTrayProjection, MainTrayProjection } from '../contract/projections.ts'

export type WalletSelector<T> = (state: MainTrayProjection) => T
export type SideTraySelector<T> = (state: SideTrayProjection) => T

// Each tray window provides the store for its own projection.
export interface TrayStateStores {
  wallet?: StoreApi<MainTrayProjection>
  sideTray?: StoreApi<SideTrayProjection>
}

const TrayStateContext = createContext<TrayStateStores>({})

export function TrayStateProvider({ state, children }: { state: TrayStateStores; children: ReactNode }) {
  return <TrayStateContext.Provider value={state}>{children}</TrayStateContext.Provider>
}

function unavailable(): never {
  throw new Error('Tray state is unavailable: wrap this tray root in <TrayStateProvider>.')
}

export function useWalletSelector<T>(selector: WalletSelector<T>) {
  return useStore(useContext(TrayStateContext).wallet ?? unavailable(), selector)
}

export function useSideTraySelector<T>(selector: SideTraySelector<T>) {
  return useStore(useContext(TrayStateContext).sideTray ?? unavailable(), selector)
}
