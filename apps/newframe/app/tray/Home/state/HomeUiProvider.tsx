import { createContext, useContext, useRef, type PropsWithChildren } from 'react'
import { useStore } from 'zustand'

import { createHomeUiStore, type HomeUiStore } from './homeUiStore'
import type { HomeUiState } from './homeUiTypes'

const HomeUiStoreContext = createContext<HomeUiStore | null>(null)

export function HomeUiProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<HomeUiStore | null>(null)
  if (!storeRef.current) storeRef.current = createHomeUiStore()

  return <HomeUiStoreContext.Provider value={storeRef.current}>{children}</HomeUiStoreContext.Provider>
}

export function useHomeUiStore<T>(selector: (state: HomeUiState) => T) {
  const store = useContext(HomeUiStoreContext)
  if (!store) throw new Error('useHomeUiStore must be used within HomeUiProvider')

  return useStore(store, selector)
}
