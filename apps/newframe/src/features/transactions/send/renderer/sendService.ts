import type { CommandMap, CommandResult } from '../../../../app/contracts/operations'
import type { NewframeHost } from '../../../../platform/ipc/contract/ipc'
import type { ClipboardCapability, TokenImageCapability } from '../../../../shared/renderer/capabilities'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type SendSubmitInput = WithoutType<CommandMap['send.submit']>

export interface SendCapability extends ClipboardCapability, TokenImageCapability {
  submit(input: SendSubmitInput): Promise<CommandResult>
  close(): Promise<CommandResult>
}

type SendHost = Pick<NewframeHost, 'executeCommand'>

export function createSendCapability(host: SendHost): SendCapability {
  return {
    submit: (input) => host.executeCommand({ type: 'send.submit', ...input }),
    close: () => host.executeCommand({ type: 'sidetray.close' }),
    writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
    hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
  }
}
