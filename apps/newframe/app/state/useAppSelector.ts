import { useStore } from 'zustand'

import { dappRendererStateStoreReadApi, walletRendererStateStoreReadApi } from './rendererStore'
import type { DappRendererState, WalletRendererState } from '../../resources/state/projections'

export type WalletSelector<T> = (state: WalletRendererState) => T
export type DappSelector<T> = (state: DappRendererState) => T

export function useWalletSelector<T>(selector: WalletSelector<T>) {
  return useStore(walletRendererStateStoreReadApi, selector)
}

export function useDappSelector<T>(selector: DappSelector<T>) {
  return useStore(dappRendererStateStoreReadApi, selector)
}
