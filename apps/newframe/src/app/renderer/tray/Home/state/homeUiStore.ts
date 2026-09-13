import { createStore } from 'zustand/vanilla'

import type { HomeUiState } from './homeUiTypes'

export function createHomeUiStore() {
  return createStore<HomeUiState>()((set) => ({
    section: 'positions',
    selectedChainId: 0,
    overlay: { type: 'none' },
    overlayHistory: [],
    setSection: (section) => set({ section }),
    setSelectedChainId: (selectedChainId) => set({ selectedChainId }),
    openOverlay: (overlay) => set({ overlay, overlayHistory: [] }),
    pushOverlay: (overlay) =>
      set((state) => ({
        overlay,
        overlayHistory:
          state.overlay.type === 'none' ? state.overlayHistory : [...state.overlayHistory, state.overlay]
      })),
    closeOverlay: () =>
      set((state) => ({
        overlay: state.overlayHistory.at(-1) ?? { type: 'none' },
        overlayHistory: state.overlayHistory.slice(0, -1)
      }))
  }))
}

export type HomeUiStore = ReturnType<typeof createHomeUiStore>
