import type { OperationRecord } from '../operations/operation.js'
import type { OperationOwner } from '../operations/types.js'
import type { CanonicalGet, CanonicalSet } from './actions.panel.js'

export interface OwnedOperation {
  owner: OperationOwner
  operation: OperationRecord
}

export function createOperationActions(set: CanonicalSet, _get: CanonicalGet) {
  return {
    operationStarted: (owner: OperationOwner, operation: OperationRecord) => {
      set((draft) => {
        draft.operations[operation.id] = { owner, operation }
      })
    },

    operationAdvanced: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) {
          current.operation = operation
        }
      })
    },

    operationCompleted: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) {
          current.operation = operation
        }
      })
    },

    operationFailed: (id: string, operation: OperationRecord) => {
      set((draft) => {
        const current = draft.operations[id]
        if (current) {
          current.operation = operation
        }
      })
    },

    operationsEvicted: (ids: readonly string[]) => {
      if (ids.length === 0) {
        return
      }
      set((draft) => {
        ids.forEach((id) => delete draft.operations[id])
      })
    }
  }
}
