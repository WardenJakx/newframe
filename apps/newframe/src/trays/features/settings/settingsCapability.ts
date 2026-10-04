import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandMap, CommandResult } from '@newframe/schema/tray-operations'

type WithoutType<T> = T extends { type: string } ? Omit<T, 'type'> : never
type Input<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>

export interface SettingsCapability {
  update(input: Input<'settings.update'>): Promise<CommandResult>
  restart(): Promise<CommandResult>
  copyText(input: Input<'clipboard.write'>): Promise<CommandResult>
  openExternal(input: Input<'external.open'>): Promise<CommandResult>
}

export function createSettingsCapability(host: Pick<NewframeHost, 'executeCommand'>): SettingsCapability {
  return {
    update: (input) => host.executeCommand({ type: 'settings.update', ...input }),
    restart: () => host.executeCommand({ type: 'app.restart' }),
    copyText: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
    openExternal: (input) => host.executeCommand({ type: 'external.open', ...input })
  }
}
