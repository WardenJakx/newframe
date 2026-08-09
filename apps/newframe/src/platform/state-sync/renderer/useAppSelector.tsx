import { createContext, type ReactNode, useContext } from 'react'
import { useStore } from 'zustand'

import type { SideTrayRendererState, WalletRendererState } from '../contract/projections'
import type { RendererStateStore } from './rendererStore'

export type WalletSelector<T> = (state: WalletRendererState) => T
export type SideTraySelector<T> = (state: SideTrayRendererState) => T

const RendererStateContext = createContext<RendererStateStore | undefined>(undefined)

export function RendererStateProvider({
  state,
  children
}: {
  state: RendererStateStore
  children: ReactNode
}) {
  return <RendererStateContext.Provider value={state}>{children}</RendererStateContext.Provider>
}

function useRendererStateStore() {
  const state = useContext(RendererStateContext)
  if (!state) {
    throw new Error('Renderer state is unavailable: wrap this renderer root in <RendererStateProvider>.')
  }
  return state
}

export function useWalletSelector<T>(selector: WalletSelector<T>) {
  return useStore(useRendererStateStore().wallet, selector)
}

export function useSideTraySelector<T>(selector: SideTraySelector<T>) {
  return useStore(useRendererStateStore().sideTray, selector)
}
