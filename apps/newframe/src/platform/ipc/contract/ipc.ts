import type {
  AppCommand,
  AppQuery,
  CommandResult,
  ResultForQuery
} from '../../../app/contracts/operations.js'
import type { StateConnectionResult, StateMessage } from '../../state-sync/contract/protocol.js'

export const ExecuteCommandChannel = 'newframe:execute-command'
export const ExecuteQueryChannel = 'newframe:execute-query'

export interface NewframeHost {
  executeCommand<TCommand extends AppCommand>(command: TCommand): Promise<CommandResult>
  executeQuery<TQuery extends AppQuery>(query: TQuery): Promise<ResultForQuery<TQuery>>
  connectState(handler: (message: StateMessage) => void): Promise<StateConnectionResult>
  disconnectState(): Promise<StateConnectionResult>
}
