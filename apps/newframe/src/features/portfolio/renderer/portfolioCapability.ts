import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandMap, CommandResult } from '@newframe/schema/tray-operations'

import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities.ts'

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
