import type { CommandMap, CommandResult } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'
import type { ClipboardCapability, TokenImageCapability } from '../../../shared/renderer/capabilities'

type WithoutType<TInput> = TInput extends { type: string } ? Omit<TInput, 'type'> : never
type CommandInput<TType extends keyof CommandMap> = WithoutType<CommandMap[TType]>

export interface RequestPanelCapability {
  back(input: CommandInput<'panel.back'>): Promise<CommandResult>
  openRequest(input: CommandInput<'panel.request-open'>): Promise<CommandResult>
}

export interface RequestReviewCapability {
  resolveAccess(input: CommandInput<'request.access-resolve'>): Promise<CommandResult>
  resolveAgentAccess(input: CommandInput<'request.agent-access-resolve'>): Promise<CommandResult>
  reviewAddChain(input: CommandInput<'request.add-chain-review'>): Promise<CommandResult>
  reviewAddToken(input: CommandInput<'request.add-token-review'>): Promise<CommandResult>
  clearOrigin(input: CommandInput<'request.clear-origin'>): Promise<CommandResult>
  confirmWarning(input: CommandInput<'request.warning-confirm'>): Promise<CommandResult>
  reject(input: CommandInput<'request.reject'>): Promise<CommandResult>
  resolveSwitchChain(input: CommandInput<'request.switch-chain-resolve'>): Promise<CommandResult>
  approve(input: CommandInput<'request.approve'>): Promise<CommandResult>
  confirmApproval(input: CommandInput<'request.approval-confirm'>): Promise<CommandResult>
  updateTokenApproval(input: CommandInput<'request.token-approval-update'>): Promise<CommandResult>
}

export interface TransactionReviewCapability {
  updateFee(input: CommandInput<'transaction.fee-update'>): Promise<CommandResult>
  setDefaultFee(input: CommandInput<'transaction.fee-default-set'>): Promise<CommandResult>
  replace(input: CommandInput<'transaction.replace'>): Promise<CommandResult>
  dismissFeeNotice(input: CommandInput<'transaction.fee-notice-dismiss'>): Promise<CommandResult>
}

export interface RequestExternalCapability extends ClipboardCapability, TokenImageCapability {
  copy(input: CommandInput<'clipboard.write'>): Promise<CommandResult>
  openExplorer(input: CommandInput<'explorer.open'>): Promise<CommandResult>
}

export type RequestRendererCapabilities = {
  panel: RequestPanelCapability
  review: RequestReviewCapability
  transaction: TransactionReviewCapability
  external: RequestExternalCapability
}

type RequestHost = Pick<NewframeHost, 'executeCommand'>

const createRequestPanelCapability = (host: RequestHost): RequestPanelCapability => ({
  back: (input) => host.executeCommand({ type: 'panel.back', ...input }),
  openRequest: (input) => host.executeCommand({ type: 'panel.request-open', ...input })
})

const createRequestReviewCapability = (host: RequestHost): RequestReviewCapability => ({
  resolveAccess: (input) => host.executeCommand({ type: 'request.access-resolve', ...input }),
  resolveAgentAccess: (input) => host.executeCommand({ type: 'request.agent-access-resolve', ...input }),
  reviewAddChain: (input) => host.executeCommand({ type: 'request.add-chain-review', ...input }),
  reviewAddToken: (input) => host.executeCommand({ type: 'request.add-token-review', ...input }),
  clearOrigin: (input) => host.executeCommand({ type: 'request.clear-origin', ...input }),
  confirmWarning: (input) => host.executeCommand({ type: 'request.warning-confirm', ...input }),
  reject: (input) => host.executeCommand({ type: 'request.reject', ...input }),
  resolveSwitchChain: (input) => host.executeCommand({ type: 'request.switch-chain-resolve', ...input }),
  approve: (input) => host.executeCommand({ type: 'request.approve', ...input }),
  confirmApproval: (input) => host.executeCommand({ type: 'request.approval-confirm', ...input }),
  updateTokenApproval: (input) => host.executeCommand({ type: 'request.token-approval-update', ...input })
})

const createTransactionReviewCapability = (host: RequestHost): TransactionReviewCapability => ({
  updateFee: (input) => host.executeCommand({ type: 'transaction.fee-update', ...input }),
  setDefaultFee: (input) => host.executeCommand({ type: 'transaction.fee-default-set', ...input }),
  replace: (input) => host.executeCommand({ type: 'transaction.replace', ...input }),
  dismissFeeNotice: (input) => host.executeCommand({ type: 'transaction.fee-notice-dismiss', ...input })
})

const createRequestExternalCapability = (host: RequestHost): RequestExternalCapability => ({
  copy: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
  openExplorer: (input) => host.executeCommand({ type: 'explorer.open', ...input }),
  writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
  hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
})

export function createRequestRendererCapabilities(host: RequestHost): RequestRendererCapabilities {
  return {
    panel: createRequestPanelCapability(host),
    review: createRequestReviewCapability(host),
    transaction: createTransactionReviewCapability(host),
    external: createRequestExternalCapability(host)
  }
}
