import type { Draft } from 'immer'

import type { OperationRecord } from '../../domain/state/operation.js'
import type { OperationOwner } from '../features/operations/types.js'
import type { CanonicalGet, CanonicalSet } from './actions.panel.js'
import type { CanonicalState } from './state/index.js'

export interface OwnedOperation {
  owner: OperationOwner
  operation: OperationRecord
}

type MutableOperations = Draft<CanonicalState>['operations']

export function createOperationActions(set: CanonicalSet, _get: CanonicalGet) {
  return {
    operationStarted: (owner: OperationOwner, operation: OperationRecord) => {
      set((draft) => {
        ;(draft.operations as MutableOperations)[operation.id] = { owner, operation }
      })
    },

    operationAdvanced: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) current.operation = operation
      })
    },

    operationCompleted: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) current.operation = operation
      })
    },

    operationFailed: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) current.operation = operation
      })
    },

    operationsEvicted: (ids: readonly string[]) => {
      if (ids.length === 0) return
      set((draft) => {
        ids.forEach((id) => delete draft.operations[id])
      })
    }
  }
}
