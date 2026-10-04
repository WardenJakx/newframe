import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandMap, CommandResult } from '@newframe/schema/tray-operations'

type UpdaterResponse = Omit<CommandMap['updater.respond'], 'type'>

export interface UpdaterCapability {
  respond(input: UpdaterResponse): Promise<CommandResult>
}

export function createUpdaterCapability(host: Pick<NewframeHost, 'executeCommand'>): UpdaterCapability {
  return { respond: (input) => host.executeCommand({ type: 'updater.respond', ...input }) }
}
