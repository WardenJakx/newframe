import type { ChainId as Chain } from '@newframe/schema/chains'

import type Signer from '../../../platform/signing/signers/Signer/index.ts'
import type { NavigationEntry } from '../../../platform/state-store/state/index.ts'

export interface AccountsRuntime {
  navigation: {
    back(windowId: string, steps?: number): void
    forward(windowId: string, crumb: NavigationEntry): void
  }
  now(): number
  notify(title: string, body: string, action: (event: Electron.Event) => void): void
  openBlockExplorer(chain: Chain, hash?: string): void
  persistence: { flush(): void }
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  signers: { get(id: string): Signer | undefined }
  windows: { showTray(): void }
}
