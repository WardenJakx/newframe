import { createStore } from 'zustand/vanilla'

export interface AvailableChain {
  chainId: number | string
  name?: string
  connected?: boolean
}

export interface FrameState {
  connected: boolean
  availableChains: AvailableChain[]
  currentChain: string
  activeOrigin: string
  siteConnected: boolean
  currentAddress: string
}

export const frameStateStore = createStore<FrameState>()(() => ({
  connected: false,
  availableChains: [],
  currentChain: '',
  activeOrigin: '',
  siteConnected: false,
  currentAddress: ''
}))
