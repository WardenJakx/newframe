import type { CommandMap, CommandResult } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface PortfolioCapability extends ClipboardCapability, TokenImageCapability {
  refresh(input: Input<'portfolio.refresh'>): Promise<CommandResult>
  openSideTray(input: Input<'sidetray.open'>): Promise<CommandResult>
}

export function createPortfolioCapability(host: Pick<NewframeHost, 'executeCommand'>): PortfolioCapability {
  return {
    refresh: (input) => host.executeCommand({ type: 'portfolio.refresh', ...input }),
    openSideTray: (input) => host.executeCommand({ type: 'sidetray.open', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
