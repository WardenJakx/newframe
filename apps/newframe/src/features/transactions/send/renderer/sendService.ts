import type { NewframeHost } from '@newframe/schema/tray-host'
import type { CommandResult, SendRequestCommand } from '@newframe/schema/tray-operations'

import type { ClipboardCapability, TokenImageCapability } from '../../../../shared/renderer/capabilities.ts'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type SendSubmitInput = WithoutType<SendRequestCommand>

export interface SendCapability extends ClipboardCapability, TokenImageCapability {
  submit(input: SendSubmitInput): Promise<CommandResult>
  close(): Promise<CommandResult>
}

type SendHost = Pick<NewframeHost, 'executeCommand'>

export function createSendCapability(host: SendHost): SendCapability {
  return {
    submit: (input) => host.executeCommand({ type: 'request.create', ...input }),
    close: () => host.executeCommand({ type: 'sidetray.close' }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
