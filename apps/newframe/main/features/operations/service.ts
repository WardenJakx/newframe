import { randomUUID } from 'node:crypto'

import { RendererProjectionSchema } from '../../../contracts/state/projections.js'
import {
  OperationRecordSchema,
  type OperationEntityRef,
  type OperationRecord,
  type OperationSafeError
} from '../../../domain/state/operation.js'
import type { CanonicalStoreReader } from '../../store/actions.js'
import type { OperationOwner, OperationReference } from './types.js'

export interface OperationClock {
  now(): number
}

export interface StartOperationInput {
  id?: string
  type: string
  owner: OperationOwner
  phase?: string
  entityRefs?: OperationEntityRef[]
}

export interface OperationService {
  start(input: StartOperationInput): OperationRecord
  advance(
    reference: OperationReference,
    update: Pick<StartOperationInput, 'phase' | 'entityRefs'>
  ): OperationRecord | undefined
  complete(reference: OperationReference, phase?: string): OperationRecord | undefined
  fail(reference: OperationReference, error: unknown, phase?: string): OperationRecord | undefined
  lookup(reference: OperationReference): OperationRecord | undefined
}

type OperationStore = Pick<CanonicalStoreReader, 'getState'>

const sensitiveText =
  /\b(?:password|passphrase|seed|mnemonic|keystore|private[\s_-]*key|signature|hardware[\s_-]*input)\b/i
const privateMaterial = /(?:0x)?[0-9a-f]{64,}|[A-Za-z0-9+/]{80,}={0,2}/

function sanitizeError(value: unknown): OperationSafeError {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawCode = typeof candidate.code === 'string' ? candidate.code.trim().toLowerCase() : ''
  const code = /^[a-z][a-z0-9_]{0,63}$/.test(rawCode) ? rawCode : 'operation_failed'
  const rawMessage =
    typeof candidate.message === 'string'
      ? candidate.message
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  const message =
    rawMessage && !sensitiveText.test(rawMessage) && !privateMaterial.test(rawMessage)
      ? rawMessage.slice(0, 256)
      : 'Operation failed.'

  return { code, message }
}

function validateOwner(owner: OperationOwner): OperationOwner {
  const parsed = RendererProjectionSchema.safeParse(owner.clientType)
  if (!parsed.success || typeof owner.windowInstanceId !== 'string' || !owner.windowInstanceId.trim()) {
    throw new Error('Invalid operation owner.')
  }
  return { clientType: parsed.data, windowInstanceId: owner.windowInstanceId }
}

export function createOperationService({
  store,
  clock,
  createId = randomUUID,
  maxTerminalRecords = 100
}: {
  store: OperationStore
  clock: OperationClock
  createId?: () => string
  maxTerminalRecords?: number
}): OperationService {
  if (!Number.isInteger(maxTerminalRecords) || maxTerminalRecords < 0) {
    throw new Error('maxTerminalRecords must be a non-negative integer.')
  }

  const lookup = ({ id, owner, type }: OperationReference) => {
    const entry = store.getState().operations[id]
    if (
      !entry ||
      entry.operation.type !== type ||
      entry.owner.clientType !== owner.clientType ||
      entry.owner.windowInstanceId !== owner.windowInstanceId
    ) {
      return
    }
    return entry.operation
  }

  const evictTerminalRecords = () => {
    const terminal = Object.values(store.getState().operations)
      .filter(({ operation }) => operation.status !== 'pending')
      .sort((left, right) => {
        const leftTime = left.operation.finishedAt ?? left.operation.updatedAt
        const rightTime = right.operation.finishedAt ?? right.operation.updatedAt
        return (
          leftTime - rightTime ||
          left.operation.startedAt - right.operation.startedAt ||
          left.operation.id.localeCompare(right.operation.id)
        )
      })
    const excess = terminal.length - maxTerminalRecords
    if (excess > 0) {
      store.getState().operationsEvicted(terminal.slice(0, excess).map(({ operation }) => operation.id))
    }
  }

  const start = (input: StartOperationInput) => {
    const id = input.id ?? createId()
    if (store.getState().operations[id]) throw new Error(`Operation already exists: ${id}`)
    const now = clock.now()
    const operation = OperationRecordSchema.parse({
      id,
      type: input.type,
      status: 'pending',
      ...(input.phase ? { phase: input.phase } : {}),
      ...(input.entityRefs ? { entityRefs: input.entityRefs } : {}),
      startedAt: now,
      updatedAt: now
    })

    store.getState().operationStarted(validateOwner(input.owner), operation)
    evictTerminalRecords()
    return operation
  }

  const complete = (reference: OperationReference, phase?: string) => {
    const current = lookup(reference)
    if (!current || current.status !== 'pending') return current
    const now = Math.max(clock.now(), current.updatedAt)
    const operation = OperationRecordSchema.parse({
      ...current,
      status: 'succeeded',
      ...(phase ? { phase } : {}),
      updatedAt: now,
      finishedAt: now
    })
    store.getState().operationCompleted(reference.id, operation)
    evictTerminalRecords()
    return operation
  }

  const advance: OperationService['advance'] = (reference, update) => {
    const current = lookup(reference)
    if (!current || current.status !== 'pending') return current
    const now = Math.max(clock.now(), current.updatedAt)
    const operation = OperationRecordSchema.parse({
      ...current,
      ...(update.phase ? { phase: update.phase } : {}),
      ...(update.entityRefs ? { entityRefs: update.entityRefs } : {}),
      updatedAt: now
    })
    store.getState().operationAdvanced(reference.id, operation)
    return operation
  }

  const fail = (reference: OperationReference, error: unknown, phase?: string) => {
    const current = lookup(reference)
    if (!current || current.status !== 'pending') return current
    const now = Math.max(clock.now(), current.updatedAt)
    const operation = OperationRecordSchema.parse({
      ...current,
      status: 'failed',
      ...(phase ? { phase } : {}),
      error: sanitizeError(error),
      updatedAt: now,
      finishedAt: now
    })
    store.getState().operationFailed(reference.id, operation)
    evictTerminalRecords()
    return operation
  }

  return { start, advance, complete, fail, lookup }
}
