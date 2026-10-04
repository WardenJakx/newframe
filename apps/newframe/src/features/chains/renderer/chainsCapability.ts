import type { CommandMap, CommandResult } from '../../../app/contracts/operations.ts'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc.ts'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface ChainsCapability {
  resolveAddChain(input: Input<'chain.request-resolve'>): Promise<CommandResult>
  remove(input: Input<'chain.remove'>): Promise<CommandResult>
  setPrimaryRpc(input: Input<'chain.primary-rpc-set'>): Promise<CommandResult>
  setChainActivation(input: Input<'chain.activation-set'>): Promise<CommandResult>
}

export function createChainsCapability(host: Pick<NewframeHost, 'executeCommand'>): ChainsCapability {
  return {
    resolveAddChain: (input) => host.executeCommand({ type: 'chain.request-resolve', ...input }),
    remove: (input) => host.executeCommand({ type: 'chain.remove', ...input }),
    setPrimaryRpc: (input) => host.executeCommand({ type: 'chain.primary-rpc-set', ...input }),
    setChainActivation: (input) => host.executeCommand({ type: 'chain.activation-set', ...input })
  }
}
