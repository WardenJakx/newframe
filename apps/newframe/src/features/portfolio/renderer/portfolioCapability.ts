import type { CommandMap, CommandResult } from '../../../app/contracts/operations.ts'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc.ts'
import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities.ts'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface PortfolioCapability extends ClipboardCapability, TokenImageCapability {
  refresh(input: Input<'portfolio.refresh'>): Promise<CommandResult>
  openSideTray(input: Input<'side-tray.open'>): Promise<CommandResult>
}

export function createPortfolioCapability(host: Pick<NewframeHost, 'executeCommand'>): PortfolioCapability {
  return {
    refresh: (input) => host.executeCommand({ type: 'portfolio.refresh', ...input }),
    openSideTray: (input) => host.executeCommand({ type: 'side-tray.open', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
