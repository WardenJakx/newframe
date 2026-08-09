import type { OperationRecord } from '../../../../platform/operations/operation'

export type TradeExecutionPhase =
  | 'idle'
  | 'requesting'
  | 'validating'
  | 'wrapping'
  | 'approving'
  | 'awaiting_approval'
  | 'awaiting_submit'
  | 'signing_permit'
  | 'signing_order'
  | 'submitting'
  | 'submitted'
  | 'failed'

export interface TradeExecutionSession {
  operationId: string
  quoteId: string
  requestKey: string
}

export interface TradeExecutionState {
  error: string
  phase: TradeExecutionPhase
  session: TradeExecutionSession | null
}

export type TradeExecutionAction =
  | { type: 'begin'; session: TradeExecutionSession }
  | { type: 'commandRejected'; error: string; session: TradeExecutionSession }
  | { type: 'projectOperation'; operation: OperationRecord; operationId: string }
  | { type: 'reset' }

export const initialTradeExecutionState: TradeExecutionState = {
  error: '',
  phase: 'idle',
  session: null
}

const pendingPhases = new Set<TradeExecutionPhase>([
  'validating',
  'wrapping',
  'approving',
  'awaiting_approval',
  'awaiting_submit',
  'signing_permit',
  'signing_order',
  'submitting'
])

function sameSession(left: TradeExecutionSession | null, right: TradeExecutionSession) {
  return (
    left?.operationId === right.operationId &&
    left.quoteId === right.quoteId &&
    left.requestKey === right.requestKey
  )
}

function projectedPhase(operation: OperationRecord): TradeExecutionPhase {
  if (operation.status === 'failed') return 'failed'
  if (operation.status === 'succeeded') return 'submitted'

  const phase = operation.phase as TradeExecutionPhase | undefined
  return phase && pendingPhases.has(phase) ? phase : 'validating'
}

export function tradeExecutionReducer(
  state: TradeExecutionState,
  action: TradeExecutionAction
): TradeExecutionState {
  switch (action.type) {
    case 'begin':
      return { error: '', phase: 'requesting', session: action.session }
    case 'commandRejected':
      if (!sameSession(state.session, action.session)) return state
      return { error: action.error, phase: 'idle', session: null }
    case 'projectOperation': {
      if (state.session?.operationId !== action.operationId) return state

      const phase = projectedPhase(action.operation)
      const error = phase === 'failed' ? action.operation.error?.message || 'Trade failed.' : ''
      if (state.phase === phase && state.error === error) return state

      return { ...state, error, phase }
    }
    case 'reset':
      return state.phase === 'idle' && !state.session && !state.error ? state : initialTradeExecutionState
    default:
      return state
  }
}

export function tradeExecutionBlocksQuotes(state: TradeExecutionState) {
  return state.phase !== 'idle'
}

export function tradeExecutionCanSubmit(state: TradeExecutionState) {
  return ['idle', 'failed', 'awaiting_approval', 'awaiting_submit'].includes(state.phase)
}
