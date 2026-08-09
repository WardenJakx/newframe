import type { CommandMap, CommandResult, QueryMap, QueryResultMap } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities'

type CommandInput<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>
type QueryInput<TType extends keyof QueryMap> = Omit<QueryMap[TType], 'type'>

export interface TokensCapability extends ClipboardCapability, TokenImageCapability {
  lookup(input: QueryInput<'token.lookup'>): Promise<QueryResultMap['token.lookup']>
  add(input: CommandInput<'token.add'>): Promise<CommandResult>
  remove(input: CommandInput<'token.remove'>): Promise<CommandResult>
}

export function createTokensCapability(
  host: Pick<NewframeHost, 'executeCommand' | 'executeQuery'>
): TokensCapability {
  return {
    lookup: (input) => host.executeQuery({ type: 'token.lookup', ...input }),
    add: (input) => host.executeCommand({ type: 'token.add', ...input }),
    remove: (input) => host.executeCommand({ type: 'token.remove', ...input }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
