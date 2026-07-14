import type { WalletRendererState } from '../../resources/state/projections'

export interface DashNavigationData extends Record<string, any> {
  dappDetails?: string
  notify?: string
  signer?: string
}

export interface DashNavigationEntry {
  view: string
  data?: DashNavigationData
}

export type DashChain = WalletRendererState['networks']['ethereum'][number]
export type DashChainMetadata = WalletRendererState['networksMeta']['ethereum'][number]
export type DashSigner = WalletRendererState['signers'][string]
export type DashMuteSettings = Partial<WalletRendererState['mute']>
export type DashRendererState = WalletRendererState
