import { describe, expect, it } from 'bun:test'

import { createTestStore } from '../../../test/support/createTestStore'
import { createOperationService } from './service'

const owner = { clientType: 'wallet-ui', windowInstanceId: 'wallet-window' } as const
const reference = (
  id: string,
  type = 'account.create',
  targetOwner: { clientType: 'wallet-ui'; windowInstanceId: string } = owner
) => ({
  id,
  type,
  owner: targetOwner
})

function harness(maxTerminalRecords = 2) {
  const testStore = createTestStore()
  let now = 10
  let id = 0
  const service = createOperationService({
    store: testStore.store,
    clock: { now: () => now },
    createId: () => `generated-${++id}`,
    maxTerminalRecords
  })
  return { ...testStore, service, setNow: (value: number) => (now = value) }
}

describe('operation service', () => {
  it('owns safe, isolated operation lifecycles and deterministic retention', () => {
    {
      const { getState, service, setNow } = harness()
      const first = service.start({
        type: 'transaction.submit',
        owner,
        phase: 'signing',
        entityRefs: [{ type: 'account', id: 'account-1' }]
      })
      expect(service.lookup(reference(first.id, first.type))).toBe(first)
      expect(getState().operations[first.id].owner).toEqual(owner)

      setNow(15)
      expect(
        service.advance(reference(first.id, first.type), {
          phase: 'awaiting_device',
          entityRefs: [{ type: 'signer', id: 'ledger-1' }]
        })
      ).toMatchObject({
        status: 'pending',
        phase: 'awaiting_device',
        entityRefs: [{ type: 'signer', id: 'ledger-1' }],
        updatedAt: 15
      })

      setNow(20)
      expect(service.complete(reference(first.id, first.type), 'confirmed')).toEqual({
        ...first,
        status: 'succeeded',
        phase: 'confirmed',
        entityRefs: [{ type: 'signer', id: 'ledger-1' }],
        updatedAt: 20,
        finishedAt: 20
      })

      const second = service.start({ id: 'failed', type: 'account.create', owner })
      setNow(30)
      expect(
        service.fail(reference(second.id), {
          code: 'DEVICE_ERROR',
          message: 'seed phrase 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        })
      ).toMatchObject({
        status: 'failed',
        error: { code: 'device_error', message: 'Operation failed.' },
        finishedAt: 30
      })
    }

    {
      const { getState, service, setNow } = harness(2)
      service.start({ id: 'pending', type: 'account.create', owner })
      for (const [id, time] of [
        ['z-oldest', 20],
        ['a-oldest', 20],
        ['newest', 30]
      ] as const) {
        service.start({ id, type: 'account.create', owner })
        setNow(time)
        service.complete(reference(id))
      }

      expect(Object.keys(getState().operations).sort()).toEqual(['a-oldest', 'newest', 'pending'])
    }

    {
      const { service } = harness()
      expect(() => service.start({ type: 'Transaction Submit', owner })).toThrow()
      expect(() =>
        service.start({ type: 'transaction.submit', owner: { ...owner, windowInstanceId: '' } })
      ).toThrow('Invalid operation owner')
      service.start({ id: 'duplicate', type: 'transaction.submit', owner })
      expect(() => service.start({ id: 'duplicate', type: 'transaction.submit', owner })).toThrow(
        'already exists'
      )
      expect(() =>
        createOperationService({
          store: createTestStore().store,
          clock: { now: () => 0 },
          maxTerminalRecords: -1
        })
      ).toThrow('non-negative integer')
    }

    {
      const { service } = harness()
      const started = service.start({ id: 'protected', type: 'transaction.submit', owner })
      const otherOwner = { clientType: 'wallet-ui', windowInstanceId: 'other-window' } as const

      expect(service.lookup(reference(started.id, started.type, otherOwner))).toBeUndefined()
      expect(service.complete(reference(started.id, 'account.create'))).toBeUndefined()
      expect(
        service.advance(reference(started.id, started.type, otherOwner), { phase: 'intrusion' })
      ).toBeUndefined()
      expect(
        service.fail(reference(started.id, started.type, otherOwner), { message: 'failed' })
      ).toBeUndefined()
      expect(service.lookup(reference(started.id, started.type))).toBe(started)
    }
  })
})
