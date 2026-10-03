import type { CommandMap, CommandResult } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface ConnectionsCapability {
  clearPermission(input: Input<'permission.clear'>): Promise<CommandResult>
  respondToExtension(input: Input<'extension.respond'>): Promise<CommandResult>
  forgetExtension(input: Input<'extension.forget'>): Promise<CommandResult>
  openExtensionAccess(input: Input<'extension.access-open'>): Promise<CommandResult>
  respondToExtensionAccess(input: Input<'extension.access-respond'>): Promise<CommandResult>
  copyText(input: Input<'clipboard.write'>): Promise<CommandResult>
}

export function createConnectionsCapability(
  host: Pick<NewframeHost, 'executeCommand'>
): ConnectionsCapability {
  return {
    clearPermission: (input) => host.executeCommand({ type: 'permission.clear', ...input }),
    respondToExtension: (input) => host.executeCommand({ type: 'extension.respond', ...input }),
    forgetExtension: (input) => host.executeCommand({ type: 'extension.forget', ...input }),
    openExtensionAccess: (input) => host.executeCommand({ type: 'extension.access-open', ...input }),
    respondToExtensionAccess: (input) => host.executeCommand({ type: 'extension.access-respond', ...input }),
    copyText: (input) => host.executeCommand({ type: 'clipboard.write', ...input })
  }
}
