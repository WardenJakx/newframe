import { createStore } from 'zustand/vanilla'

import type { HomeUiState } from './homeUiTypes'

export function createHomeUiStore() {
  return createStore<HomeUiState>()((set) => ({
    section: 'positions',
    selectedChainId: 0,
    overlay: { type: 'none' },
    setSection: (section) => set({ section }),
    setSelectedChainId: (selectedChainId) => set({ selectedChainId }),
    openOverlay: (overlay) => set({ overlay }),
    closeOverlay: () => set({ overlay: { type: 'none' } })
  }))
}

export type HomeUiStore = ReturnType<typeof createHomeUiStore>
