import { useStore } from 'zustand'

import { sideTrayRendererStateStoreReadApi, walletRendererStateStoreReadApi } from './rendererStore'
import type { SideTrayRendererState, WalletRendererState } from '../../resources/state/projections'

export type WalletSelector<T> = (state: WalletRendererState) => T
export type SideTraySelector<T> = (state: SideTrayRendererState) => T

export function useWalletSelector<T>(selector: WalletSelector<T>) {
  return useStore(walletRendererStateStoreReadApi, selector)
}

export function useSideTraySelector<T>(selector: SideTraySelector<T>) {
  return useStore(sideTrayRendererStateStoreReadApi, selector)
}
