import type { CommandMap, CommandResult } from '../../../app/contracts/operations'
import type { NewframeHost } from '../../../platform/ipc/contract/ipc'

type Input<TType extends keyof CommandMap> = Omit<CommandMap[TType], 'type'>

export interface NetworksCapability {
  resolveAddChain(input: Input<'network.request-resolve'>): Promise<CommandResult>
  setPrimaryRpc(input: Input<'network.primary-rpc-set'>): Promise<CommandResult>
  setNetworkActivation(input: Input<'network.activation-set'>): Promise<CommandResult>
}

export function createNetworksCapability(host: Pick<NewframeHost, 'executeCommand'>): NetworksCapability {
  return {
    resolveAddChain: (input) => host.executeCommand({ type: 'network.request-resolve', ...input }),
    setPrimaryRpc: (input) => host.executeCommand({ type: 'network.primary-rpc-set', ...input }),
    setNetworkActivation: (input) => host.executeCommand({ type: 'network.activation-set', ...input })
  }
}
