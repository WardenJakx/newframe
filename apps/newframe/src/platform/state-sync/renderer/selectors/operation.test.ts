import { describe, expect, it } from 'bun:test'

import {
  createOperationByIdSelector,
  createOperationsByStatusSelector,
  selectOperationById,
  selectOperationEntityId,
  selectOperationError
} from './operation'
import type { OperationCollection } from '../../../operations/operation'

const pending = {
  id: 'pending',
  type: 'transaction.submit',
  status: 'pending',
  startedAt: 1,
  updatedAt: 1
} as const
const succeeded = {
  id: 'succeeded',
  type: 'account.select',
  status: 'succeeded',
  startedAt: 1,
  updatedAt: 2,
  finishedAt: 2
} as const

describe('operation selectors', () => {
  it('selects stable operation records, statuses, failures, and entity references', () => {
    {
      const state = { operations: { pending } satisfies OperationCollection }
      const selectPending = createOperationByIdSelector('pending')

      expect(selectOperationById(state, 'pending')).toBe(pending)
      expect(selectPending(state)).toBe(pending)
      expect(selectPending(state)).toBe(selectPending(state))
      expect(selectOperationById(state, 'missing')).toBeUndefined()
    }

    {
      const selectPending = createOperationsByStatusSelector('pending')
      const operations = { pending, succeeded } satisfies OperationCollection
      const first = selectPending({ operations })

      expect(first).toEqual([pending])
      expect(selectPending({ operations })).toBe(first)

      const next = selectPending({ operations: { ...operations } })
      expect(next).toEqual([pending])
      expect(next).not.toBe(first)
    }

    {
      const error = { code: 'duplicate_name', message: 'A profile with that name already exists.' }
      const failed = {
        id: 'failed',
        type: 'profile.create',
        status: 'failed' as const,
        error,
        entityRefs: [{ type: 'profile' as const, id: 'profile-1' }],
        startedAt: 1,
        updatedAt: 2,
        finishedAt: 2
      }
      const state = { operations: { failed } }

      expect(selectOperationError(state, 'failed')).toBe(error)
      expect(selectOperationEntityId(state, 'failed', 'profile')).toBe('profile-1')
      expect(selectOperationEntityId(state, 'failed', 'account')).toBeUndefined()
    }
  })
})
