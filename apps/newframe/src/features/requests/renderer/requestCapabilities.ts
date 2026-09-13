import type {
  CommandMap,
  CommandResult,
  QueryMap,
  QueryResultMap,
  SafeApprovalCommand
} from '../../../app/contracts/operations'
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
  setFeePreference(input: {
    chainId: number
    level: Extract<CommandInput<'settings.update'>, { setting: 'gas-fee-level' }>['value']
  }): Promise<CommandResult>
  replace(input: CommandInput<'transaction.replace'>): Promise<CommandResult>
}

export interface RequestExternalCapability extends ClipboardCapability, TokenImageCapability {
  copy(input: CommandInput<'clipboard.write'>): Promise<CommandResult>
  openExplorer(input: CommandInput<'explorer.open'>): Promise<CommandResult>
}

interface SafeQueueCapability {
  refresh(input: CommandInput<'account.refresh'>): Promise<CommandResult>
  simulate(input: Omit<QueryMap['safe.simulate'], 'type'>): Promise<QueryResultMap['safe.simulate']>
  confirm(input: WithoutType<SafeApprovalCommand>): Promise<CommandResult>
  confirmationStatus(
    input: Omit<QueryMap['safe.confirmation-status'], 'type'>
  ): Promise<QueryResultMap['safe.confirmation-status']>
}

export type RequestRendererCapabilities = {
  safe: SafeQueueCapability
  panel: RequestPanelCapability
  review: RequestReviewCapability
  transaction: TransactionReviewCapability
  external: RequestExternalCapability
}

type RequestHost = Pick<NewframeHost, 'executeCommand' | 'executeQuery'>

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
  setFeePreference: ({ chainId, level }) =>
    host.executeCommand({ type: 'settings.update', setting: 'gas-fee-level', chainId, value: level }),
  replace: (input) => host.executeCommand({ type: 'transaction.replace', ...input })
})

const createRequestExternalCapability = (host: RequestHost): RequestExternalCapability => ({
  copy: (input) => host.executeCommand({ type: 'clipboard.write', ...input }),
  openExplorer: (input) => host.executeCommand({ type: 'explorer.open', ...input }),
  writeText: (text) => host.executeCommand({ type: 'clipboard.write', text }),
  hydrateTokenImage: (tokenId) => host.executeCommand({ type: 'token.image-hydrate', tokenId })
})

export function createRequestRendererCapabilities(host: RequestHost): RequestRendererCapabilities {
  return {
    safe: {
      refresh: (input) => host.executeCommand({ type: 'account.refresh', ...input }),
      confirm: (input) => host.executeCommand({ type: 'request.approve', ...input }),
      confirmationStatus: async (input) => {
        const result = await host.executeQuery({ type: 'safe.confirmation-status', ...input })
        if ('status' in result) return result
        throw new Error(result.message || 'Could not load confirmation status.')
      },
      simulate: async (input) => {
        const result = await host.executeQuery({ type: 'safe.simulate', ...input })
        return 'status' in result
          ? result
          : { status: 'unavailable', error: result.message || 'Could not load Safe preview.' }
      }
    },
    panel: createRequestPanelCapability(host),
    review: createRequestReviewCapability(host),
    transaction: createTransactionReviewCapability(host),
    external: createRequestExternalCapability(host)
  }
}
