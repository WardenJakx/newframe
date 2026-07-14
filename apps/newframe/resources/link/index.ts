import type { AppCommand, AppQuery, ResultForCommand, ResultForQuery } from '../bridge/operations'
import type { StateConnectionResult, StateMessage } from '../state/protocol'

const getHost = () => {
  if (typeof window === 'undefined' || !window.__NEWFRAME_HOST__) {
    throw new Error('Newframe host bridge is unavailable')
  }

  return window.__NEWFRAME_HOST__
}

type Link = {
  executeCommand<TCommand extends AppCommand>(command: TCommand): Promise<ResultForCommand<TCommand>>
  executeQuery<TQuery extends AppQuery>(query: TQuery): Promise<ResultForQuery<TQuery>>
  connectState(handler: (message: StateMessage) => void): Promise<StateConnectionResult>
  disconnectState(): Promise<StateConnectionResult>
}

const link: Link = {
  executeCommand: (command) => getHost().executeCommand(command),
  executeQuery: (query) => getHost().executeQuery(query),
  connectState: (handler) => getHost().connectState(handler),
  disconnectState: () => getHost().disconnectState()
}

export default link
