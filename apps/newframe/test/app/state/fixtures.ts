import { projectWalletState } from '../../../main/state/projections'
import createInitialState from '../../../main/store/state'
import type { WalletRendererState } from '../../../resources/state/projections'

const baseWalletState = projectWalletState(createInitialState())

export function walletState(overrides: Partial<WalletRendererState>): WalletRendererState {
  return { ...baseWalletState, ...overrides }
}

export function walletChanges(changes: Partial<WalletRendererState>): Partial<WalletRendererState> {
  return changes
}
