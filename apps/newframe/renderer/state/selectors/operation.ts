import type { WalletRendererState } from '../../../contracts/state/projections'
import type { OperationEntityRef, OperationRecord, OperationStatus } from '../../../domain/state/operation'

type OperationState = Pick<WalletRendererState, 'operations'>

export function selectOperationById(state: OperationState, id: string): OperationRecord | undefined {
  return state.operations?.[id]
}

export function selectOperationError(state: OperationState, id: string) {
  const operation = selectOperationById(state, id)
  return operation?.status === 'failed' ? operation.error : undefined
}

export function selectOperationEntityId(state: OperationState, id: string, type: OperationEntityRef['type']) {
  return selectOperationById(state, id)?.entityRefs?.find((reference) => reference.type === type)?.id
}

export function createOperationByIdSelector(id: string) {
  return (state: OperationState) => selectOperationById(state, id)
}

export function createOperationsByStatusSelector(status: OperationStatus) {
  let previousOperations: OperationState['operations'] | undefined
  let previousResult: OperationRecord[] = []

  return (state: OperationState) => {
    if (state.operations === previousOperations) return previousResult

    previousOperations = state.operations
    previousResult = Object.values(state.operations || {}).filter((operation) => operation.status === status)
    return previousResult
  }
}
