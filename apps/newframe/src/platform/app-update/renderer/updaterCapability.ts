import type { CommandMap, CommandResult } from '../../../app/contracts/operations.ts'
import type { NewframeHost } from '../../ipc/contract/ipc.ts'

type UpdaterResponse = Omit<CommandMap['updater.respond'], 'type'>

export interface UpdaterCapability {
  respond(input: UpdaterResponse): Promise<CommandResult>
}

export function createUpdaterCapability(host: Pick<NewframeHost, 'executeCommand'>): UpdaterCapability {
  return { respond: (input) => host.executeCommand({ type: 'updater.respond', ...input }) }
}
