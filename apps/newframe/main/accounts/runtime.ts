import type { Chain } from '../chains/index.js'
import type Signer from '../signers/Signer/index.js'

export interface AccountsRuntime {
  navigation: {
    back(windowId: string, steps?: number): void
    forward(windowId: string, crumb: unknown): void
  }
  now(): number
  notify(title: string, body: string, action: (event: Electron.Event) => void): void
  openBlockExplorer(chain: Chain, hash?: string): void
  persistence: { flush(): void }
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  signers: { get(id: string): Signer | undefined }
  windows: { showTray(): void }
}
