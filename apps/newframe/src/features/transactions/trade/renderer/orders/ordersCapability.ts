import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandMap, CommandResult } from '@newframe/schema/tray-operations'

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
