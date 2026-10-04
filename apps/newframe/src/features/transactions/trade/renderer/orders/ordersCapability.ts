import type { CommandMap, CommandResult } from '../../../../../app/contracts/operations.ts'
import type { NewframeHost } from '../../../../../platform/ipc/contract/ipc.ts'
import type { TokenImageCapability } from '../../../../../shared/renderer/capabilities.ts'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface OrdersCapability extends TokenImageCapability {
  cancel(input: Input<'flash.order-cancel'>): Promise<CommandResult>
}

export function createOrdersCapability(host: Pick<NewframeHost, 'executeCommand'>): OrdersCapability {
  return {
    cancel: (input) => host.executeCommand({ type: 'flash.order-cancel', ...input }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
