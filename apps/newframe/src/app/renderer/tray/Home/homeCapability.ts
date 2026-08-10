import type { CommandMap, CommandResult } from '../../../contracts/operations'
import type { NewframeHost } from '../../../../platform/ipc/contract/ipc'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface HomeCapability {
  selectAccount(input: Input<'account.select'>): Promise<CommandResult>
  consumeCommand(input: Input<'home.command-consume'>): Promise<CommandResult>
  updateNotification(input: Input<'notification.update'>): Promise<CommandResult>
  toggleWarning(input: Input<'warning.toggle'>): Promise<CommandResult>
  copyText(input: Input<'clipboard.write'>): Promise<CommandResult>
  quit(): Promise<CommandResult>
}

export function createHomeCapability(host: Pick<NewframeHost, 'executeCommand'>): HomeCapability {
  return {
    selectAccount: (input) => host.executeCommand({ type: 'account.select', ...input }),
    consumeCommand: (input) => host.executeCommand({ type: 'home.command-consume', ...input }),
    updateNotification: (input) => host.executeCommand({ type: 'notification.update', ...input }),
    toggleWarning: (input) => host.executeCommand({ type: 'warning.toggle', ...input }),
    copyText: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    quit: () => host.executeCommand({ type: 'app.quit' })
  }
}
