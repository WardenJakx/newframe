import { createContext, type ReactNode, useContext } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'

import type { SideTrayRendererState, WalletRendererState } from '../contract/projections.ts'

export type WalletSelector<T> = (state: WalletRendererState) => T
export type SideTraySelector<T> = (state: SideTrayRendererState) => T

// Each renderer window provides the store for its own projection.
export interface RendererStateStores {
  wallet?: StoreApi<WalletRendererState>
  sideTray?: StoreApi<SideTrayRendererState>
}

const RendererStateContext = createContext<RendererStateStores>({})

export function RendererStateProvider({
  state,
  children
}: {
  state: RendererStateStores
  children: ReactNode
}) {
  return <RendererStateContext.Provider value={state}>{children}</RendererStateContext.Provider>
}

function unavailable(): never {
  throw new Error('Renderer state is unavailable: wrap this renderer root in <RendererStateProvider>.')
}

export function useWalletSelector<T>(selector: WalletSelector<T>) {
  return useStore(useContext(RendererStateContext).wallet ?? unavailable(), selector)
}

export function useSideTraySelector<T>(selector: SideTraySelector<T>) {
  return useStore(useContext(RendererStateContext).sideTray ?? unavailable(), selector)
}
