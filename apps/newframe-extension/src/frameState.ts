import { createStore } from 'zustand/vanilla'

export interface AvailableChain {
  chainId: number | string
  name?: string
  connected?: boolean
}

export type ConnectionStatus = 'desktop-unavailable' | 'extension-approval-pending' | 'connected'

export interface FrameState {
  connectionStatus: ConnectionStatus
  availableChains: AvailableChain[]
  currentChain: string
  activeOrigin: string
  siteConnected: boolean
  currentAddress: string
}

export const frameStateStore = createStore<FrameState>()(() => ({
  connectionStatus: 'desktop-unavailable',
  availableChains: [],
  currentChain: '',
  activeOrigin: '',
  siteConnected: false,
  currentAddress: ''
}))
