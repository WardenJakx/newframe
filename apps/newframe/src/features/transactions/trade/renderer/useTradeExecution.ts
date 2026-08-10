import React from 'react'

import type { FlashQuoteDisplay } from '../../../../app/contracts/operations'
import type { OperationCollection, OperationRecord } from '../../../../platform/operations/operation'
import type { TradeCapability } from './tradeService'
import { tradeErrorMessage } from './tradeTransaction'
import {
  initialTradeExecutionState,
  tradeExecutionBlocksQuotes,
  tradeExecutionCanSubmit,
  tradeExecutionReducer,
  type TradeExecutionSession
} from './tradeExecutionMachine'

export function useTradeExecution({
  capability,
  operations,
  requestKey
}: {
  capability: TradeCapability
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
    void capability.release().catch(() => undefined)
  }, [capability, requestKey, state.session])

  React.useEffect(() => {
    return () => {
      void capability.release().catch(() => undefined)
    }
  }, [capability])

  const reset = React.useCallback(
    (release = true) => {
      dispatch({ type: 'reset' })
      if (release) void capability.release().catch(() => undefined)
    },
    [capability]
  )

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
          ? capability.submit({ operationId: session.operationId, quoteId: session.quoteId })
          : capability.prepare({
              operationId: session.operationId,
              quoteId: session.quoteId,
              action: nextAction
            })

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
    [capability, requestKey, state]
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
