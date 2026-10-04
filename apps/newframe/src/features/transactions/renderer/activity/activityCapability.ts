import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandMap, CommandResult } from '@newframe/schema/tray-operations'

import type { ClipboardCapability, TokenImageCapability } from '../../../../shared/renderer/capabilities.ts'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface ActivityCapability extends ClipboardCapability, TokenImageCapability {
  openExplorer(input: Input<'explorer.open'>): Promise<CommandResult>
  copyText(input: Input<'clipboard.write'>): Promise<CommandResult>
}

export function createActivityCapability(host: Pick<NewframeHost, 'executeCommand'>): ActivityCapability {
  return {
    openExplorer: (input) => host.executeCommand({ type: 'explorer.open', ...input }),
    copyText: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
