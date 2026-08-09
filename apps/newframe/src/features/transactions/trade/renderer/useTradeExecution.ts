import React from 'react'

import type { FlashQuoteDisplay } from '../../../../app/contracts/operations'
import type { OperationCollection, OperationRecord } from '../../../../platform/operations/operation'
import { prepareTrade, releaseTrade, submitTrade } from './tradeService'
import { tradeErrorMessage } from './tradeTransaction'
import {
  initialTradeExecutionState,
  tradeExecutionBlocksQuotes,
  tradeExecutionCanSubmit,
  tradeExecutionReducer,
  type TradeExecutionSession
} from './tradeExecutionMachine'

export function useTradeExecution({
  operations,
  requestKey
}: {
  operations: OperationCollection
  requestKey: string
}) {
  const [state, dispatch] = React.useReducer(tradeExecutionReducer, initialTradeExecutionState)
  const operation: OperationRecord | undefined = state.session
    ? operations[state.session.operationId]
    : undefined

  React.useEffect(() => {
    if (!operation || !state.session) return
    dispatch({
      type: 'projectOperation',
      operation,
      operationId: state.session.operationId
    })
  }, [operation, state.phase, state.session])

  React.useEffect(() => {
    if (!state.session || state.session.requestKey === requestKey) return
    dispatch({ type: 'reset' })
    void releaseTrade()
  }, [requestKey, state.session])

  React.useEffect(() => {
    return () => {
      void releaseTrade()
    }
  }, [])

  const reset = React.useCallback((release = true) => {
    dispatch({ type: 'reset' })
    if (release) void releaseTrade()
  }, [])

  const submit = React.useCallback(
    ({ quote, quoteId }: { quote: FlashQuoteDisplay | null; quoteId: string }) => {
      if (!quote || !quoteId || !tradeExecutionCanSubmit(state)) return

      const nextAction =
        state.phase === 'awaiting_approval'
          ? 'approve'
          : state.phase === 'awaiting_submit'
            ? 'sign'
            : quote.nextAction
      const session: TradeExecutionSession =
        state.session && ['awaiting_approval', 'awaiting_submit'].includes(state.phase)
          ? state.session
          : { operationId: crypto.randomUUID(), quoteId, requestKey }

      dispatch({ type: 'begin', session })
      const command =
        nextAction === 'sign'
          ? submitTrade(session.operationId, session.quoteId)
          : prepareTrade(session.operationId, session.quoteId, nextAction)

      void command
        .then((result) => {
          if (result.ok) return
          dispatch({
            type: 'commandRejected',
            error: result.message || 'Trade request was not accepted.',
            session
          })
        })
        .catch((error) => {
          dispatch({
            type: 'commandRejected',
            error: tradeErrorMessage(error, 'Trade request failed.'),
            session
          })
        })
    },
    [requestKey, state]
  )

  return {
    blocksQuoteRefresh: tradeExecutionBlocksQuotes(state),
    canSubmit: tradeExecutionCanSubmit(state),
    operation,
    reset,
    state,
    submit
  }
}
