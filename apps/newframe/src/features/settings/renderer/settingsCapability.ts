import type { CommandMap, CommandResult } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'

type WithoutType<T> = T extends { type: string } ? Omit<T, 'type'> : never
type Input<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>

export interface SettingsCapability {
  update(input: Input<'settings.update'>): Promise<CommandResult>
  copyText(input: Input<'clipboard.write'>): Promise<CommandResult>
  openExternal(input: Input<'external.open'>): Promise<CommandResult>
}

export function createSettingsCapability(host: Pick<NewframeHost, 'executeCommand'>): SettingsCapability {
  return {
    update: (input) => host.executeCommand({ type: 'settings.update', ...input }),
    copyText: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    openExternal: (input) => host.executeCommand({ type: 'external.open', ...input })
  }
}
