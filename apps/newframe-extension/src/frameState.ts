import type { AvailableChain, ExtensionAccounts } from '@newframe/desktop-api/schemas'
import { createStore } from 'zustand/vanilla'

export type ConnectionStatus =
  | 'desktop-unavailable'
  | 'extension-approval-pending'
  | 'extension-approval-rejected'
  | 'connected'

export interface FrameState {
  connectionStatus: ConnectionStatus
  availableChains: AvailableChain[]
  currentChain: string
  activeOrigin: string
  siteConnected: boolean
  currentAddress: string
  /** Accounts the app shares with the extension in its current profile. */
  extensionAccounts: ExtensionAccounts
}

export const frameStateStore = createStore<FrameState>()(() => ({
  connectionStatus: 'desktop-unavailable',
  availableChains: [],
  currentChain: '',
  activeOrigin: '',
  siteConnected: false,
  currentAddress: '',
  extensionAccounts: { accounts: [], selected: '' }
}))
