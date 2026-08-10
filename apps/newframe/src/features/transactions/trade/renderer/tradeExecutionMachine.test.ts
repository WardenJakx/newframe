import { describe, expect, it } from 'bun:test'

import type { OperationRecord } from '../../../../platform/operations/operation'
import {
  initialTradeExecutionState,
  tradeExecutionBlocksQuotes,
  tradeExecutionCanSubmit,
  tradeExecutionReducer,
  type TradeExecutionSession
} from './tradeExecutionMachine'

const session: TradeExecutionSession = {
  operationId: 'operation-1',
  quoteId: 'quote-1',
  requestKey: 'request-1'
}

function operation(changes: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: 'operation-1',
    type: 'trade.execute',
    status: 'pending',
    phase: 'signing_order',
    startedAt: 1,
    updatedAt: 2,
    ...changes
  }
}

describe('tradeExecutionMachine', () => {
  it('correlates canonical operation projection to the active execution session', () => {
    const requesting = tradeExecutionReducer(initialTradeExecutionState, { type: 'begin', session })
    const stale = tradeExecutionReducer(requesting, {
      type: 'projectOperation',
      operation: operation({ id: 'other-operation' }),
      operationId: 'other-operation'
    })
    const signing = tradeExecutionReducer(stale, {
      type: 'projectOperation',
      operation: operation(),
      operationId: session.operationId
    })

    expect(stale).toBe(requesting)
    expect(signing).toEqual({ error: '', phase: 'signing_order', session })
    expect(tradeExecutionBlocksQuotes(signing)).toBe(true)
  })

  it('projects failure for retry and ignores stale command acknowledgements', () => {
    const requesting = tradeExecutionReducer(initialTradeExecutionState, { type: 'begin', session })
    const rejected = tradeExecutionReducer(requesting, {
      type: 'commandRejected',
      error: 'Stale failure.',
      session: { ...session, operationId: 'other-operation' }
    })
    const failed = tradeExecutionReducer(rejected, {
      type: 'projectOperation',
      operation: operation({
        status: 'failed',
        phase: 'signing_order_failed',
        error: { code: 'sign_failed', message: 'Order signature was rejected.' },
        finishedAt: 2
      }),
      operationId: session.operationId
    })

    expect(rejected).toBe(requesting)
    expect(failed.error).toBe('Order signature was rejected.')
    expect(failed.phase).toBe('failed')
    expect(tradeExecutionCanSubmit(failed)).toBe(true)
  })
})
