import type { AppCommand, AppQuery, ResultForCommand, ResultForQuery } from './operations'
import type { StateConnectionResult, StateMessage } from '../state/protocol'

export const ExecuteCommandChannel = 'newframe:execute-command'
export const ExecuteQueryChannel = 'newframe:execute-query'

export interface NewframeHost {
  executeCommand<TCommand extends AppCommand>(command: TCommand): Promise<ResultForCommand<TCommand>>
  executeQuery<TQuery extends AppQuery>(query: TQuery): Promise<ResultForQuery<TQuery>>
  connectState(handler: (message: StateMessage) => void): Promise<StateConnectionResult>
  disconnectState(): Promise<StateConnectionResult>
}
