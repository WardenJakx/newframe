import type { CommandMap, CommandResult } from '../../../../app/contracts/operations'
import type { NewframeHost } from '../../../../platform/ipc/contract/ipc'
import type { ClipboardCapability, TokenImageCapability } from '../../../../shared/renderer/capabilities'

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
