import { describe, expect, it, mock } from 'bun:test'

import { DEFAULT_PROFILE_ID } from '../../../../app/contracts/state/main'
import { createTestStore } from '../../../../../test/support/createTestStore'
import { createOperationService } from '../../../../platform/operations/service'
import type { OperationOwner } from '../../../../platform/operations/types'
import { createProfileService } from './service'

const first = '0x1111111111111111111111111111111111111111'
const second = '0x2222222222222222222222222222222222222222'
const owner: OperationOwner = { clientType: 'wallet-ui', windowInstanceId: 'wallet-one' }
const account = (id: string, profileId: string, name: string) => ({
  id,
  profileId,
  address: id,
  name,
  lastSignerType: 'address',
  status: 'ok',
  signer: '',
  requests: {},
  created: 'test:1'
})

function harness() {
  const testStore = createTestStore({
    main: {
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Personal' },
        work: { id: 'work', name: 'Work' }
      },
      profileOrder: [DEFAULT_PROFILE_ID, 'work'],
      currentProfile: DEFAULT_PROFILE_ID,
      currentAccount: first,
      accounts: {
        [first]: account(first, DEFAULT_PROFILE_ID, 'First'),
        [second]: account(second, 'work', 'Second')
      },
      accountOrder: [first, second]
    }
  })
  let now = 1
  const operations = createOperationService({
    store: testStore.store,
    clock: { now: () => now++ },
    createId: () => 'unused'
  })
  const accountsChanged = mock()
  const service = createProfileService({
    accounts: { get: (id) => testStore.getState().main.accounts[id] },
    operations,
    provider: { accountsChanged },
    store: testStore.store,
    createProfileId: () => 'travel'
  })
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  return { ...testStore, accountsChanged, operation, service }
}

describe('profile service', () => {
  it('owns successful, failed, duplicate, and query profile behavior', () => {
    {
      const { accountsChanged, getState, operation, service } = harness()

      service.select({ type: 'profile.select', operationId: 'select', profileId: 'work' }, owner)
      service.moveAccount(
        {
          type: 'account.profile-move',
          operationId: 'move',
          accountId: second,
          profileId: DEFAULT_PROFILE_ID
        },
        owner
      )
      service.delete({ type: 'profile.delete', operationId: 'delete', profileId: 'work' }, owner)
      const createCommand = {
        type: 'profile.create',
        operationId: 'create',
        name: '  Travel  ',
        accountIds: [second]
      } satisfies Parameters<typeof service.create>[0]
      service.create(createCommand, owner)
      service.create(createCommand, owner)
      service.rename(
        { type: 'profile.rename', operationId: 'rename', profileId: 'travel', name: 'Trips' },
        owner
      )

      expect(getState().main).toMatchObject({
        currentProfile: 'travel',
        currentAccount: second,
        profiles: { travel: { id: 'travel', name: 'Trips' } },
        accounts: { [second]: { profileId: 'travel' } }
      })
      expect(getState().main.profiles).not.toHaveProperty('work')
      expect(['select', 'move', 'delete', 'create', 'rename'].map((id) => operation(id)?.status)).toEqual([
        'succeeded',
        'succeeded',
        'succeeded',
        'succeeded',
        'succeeded'
      ])
      expect(accountsChanged.mock.calls.map(([addresses]) => addresses)).toEqual([
        [second],
        [],
        [first],
        [second]
      ])
    }

    {
      const { accountsChanged, getState, operation, service } = harness()
      const before = structuredClone(getState().main)

      service.rename(
        { type: 'profile.rename', operationId: 'duplicate', profileId: 'work', name: ' personal ' },
        owner
      )
      service.delete({ type: 'profile.delete', operationId: 'nonempty', profileId: 'work' }, owner)
      service.moveAccount(
        {
          type: 'account.profile-move',
          operationId: 'same',
          accountId: second,
          profileId: 'work'
        },
        owner
      )

      expect(getState().main).toEqual(before)
      expect([operation('duplicate'), operation('nonempty'), operation('same')]).toMatchObject([
        { status: 'failed', error: { code: 'duplicate_name' } },
        { status: 'failed', error: { code: 'profile_not_empty' } },
        { status: 'failed', error: { code: 'same_profile' } }
      ])
      expect(accountsChanged.mock.calls).toHaveLength(0)
    }

    {
      const { accountsChanged, getState, operation, service } = harness()
      const command = { type: 'profile.select', operationId: 'stable', profileId: 'work' } as const
      expect(service.select(command, owner)).toBeTrue()
      const completed = operation('stable')
      expect(service.select(command, owner)).toBeTrue()
      expect(
        service.rename(
          { type: 'profile.rename', operationId: 'stable', profileId: 'work', name: 'Attacker' },
          { clientType: 'wallet-ui', windowInstanceId: 'wallet-two' }
        )
      ).toBeFalse()

      expect(operation('stable')).toBe(completed)
      expect(getState().main.profiles.work.name).toBe('Work')
      expect(accountsChanged.mock.calls).toHaveLength(1)
      expect(service.movableAccounts()).toEqual({
        ok: true,
        accounts: [
          { id: first, address: first, name: 'First', profileId: DEFAULT_PROFILE_ID },
          { id: second, address: second, name: 'Second', profileId: 'work' }
        ]
      })
    }
  })
})
