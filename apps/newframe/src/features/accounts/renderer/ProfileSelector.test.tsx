import { beforeEach, describe, expect, it } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../platform/state-sync/contract/protocol'
import type { OperationRecord } from '../../../platform/operations/operation'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { ProfileSelector } from './ProfileSelector'
import { createAccountsCapabilityFake, type AccountsCapabilityFake } from './accountsCapability.test-support'

const fixture = registerTestRuntimeFixture()
let capability: AccountsCapabilityFake
const profiles = [
  { id: 'personal', name: 'Personal', accountCount: 2, cachedValue: { state: 'missing' as const } },
  { id: 'work', name: 'Work', accountCount: 1, cachedValue: { state: 'unpriced' as const } },
  { id: 'empty', name: 'Empty', accountCount: 0, cachedValue: { state: 'priced' as const, value: 12.5 } }
]
let revision = 0

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function publishOperation(operation: OperationRecord) {
  const baseRevision = revision
  revision += 1
  act(() => {
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'profiles-test',
      baseRevision,
      revision,
      changes: { operations: { [operation.id]: operation } }
    })
  })
}

function operation(id: string, type: string, status: 'pending' | 'succeeded' | 'failed') {
  return {
    id,
    type,
    status,
    startedAt: 1,
    updatedAt: status === 'pending' ? 1 : 2,
    ...(status === 'pending' ? {} : { finishedAt: 2 })
  } satisfies OperationRecord
}

describe('ProfileSelector', () => {
  beforeEach(() => {
    capability = createAccountsCapabilityFake()
    revision = 0
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'profiles-test',
      revision: 0,
      state: walletState({ currentProfile: 'personal', profiles, operations: {} })
    })
  })

  it('shows every ordered summary and supports listbox keyboard selection without a dormant query', async () => {
    const { rerender, user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )

    expect(capability.listMovableProfileAccounts.mock.calls).toHaveLength(0)
    const trigger = screen.getByRole('button', { name: 'Select active profile' })
    await user.click(trigger)

    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('---')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('$12.50')).toBeTruthy()
    expect(screen.getByText('2 Accounts')).toBeTruthy()
    expect(screen.getByText('1 Account')).toBeTruthy()

    trigger.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(capability.selectProfile.mock.calls.at(-1)?.[0]).toEqual({
      operationId: expect.any(String),
      profileId: 'work'
    })
    const command = capability.selectProfile.mock.calls.at(-1)![0]
    expect(screen.getAllByRole('option')).toHaveLength(3)

    publishOperation(operation(command.operationId, 'profile.select', 'succeeded'))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    rerender(<ProfileSelector capability={capability} currentProfile='work' profiles={profiles} />)
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
  })

  it('queries movable accounts only after create opens and creates with selected moves', async () => {
    capability.listMovableProfileAccounts.mockResolvedValueOnce({
      ok: true,
      accounts: [{ id: 'account-1', address: '0x1', name: 'Primary', profileId: 'personal' }]
    })
    const { rerender, user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )
    expect(capability.listMovableProfileAccounts.mock.calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(capability.listMovableProfileAccounts.mock.calls).toHaveLength(1)
    await user.type(screen.getByLabelText('New profile name'), '  Travel  ')
    await user.click(await screen.findByRole('button', { name: /Primary/ }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(capability.createProfile.mock.calls.at(-1)?.[0]).toEqual({
      operationId: expect.any(String),
      name: 'Travel',
      accountIds: ['account-1']
    })
    const command = capability.createProfile.mock.calls.at(-1)![0]
    expect(screen.getByLabelText('New profile name')).toBeTruthy()
    publishOperation({
      ...operation(command.operationId, 'profile.create', 'succeeded'),
      entityRefs: [{ type: 'profile', id: 'new-profile' }]
    })
    expect(screen.getByLabelText('New profile name')).toBeTruthy()
    rerender(
      <ProfileSelector
        capability={capability}
        currentProfile='new-profile'
        profiles={[
          ...profiles,
          {
            id: 'new-profile',
            name: 'Travel',
            accountCount: 1,
            cachedValue: { state: 'missing' }
          }
        ]}
      />
    )
    await waitFor(() => expect(screen.queryByLabelText('New profile name')).toBeNull())
  })

  it('creates without moves, validates names, and keeps command failures visible', async () => {
    capability.listMovableProfileAccounts.mockResolvedValueOnce({ ok: true, accounts: [] })
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(screen.getByText('Enter a profile name between 1 and 50 characters.')).toBeTruthy()
    expect(capability.createProfile.mock.calls).toHaveLength(0)

    await user.type(screen.getByLabelText('New profile name'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(capability.createProfile.mock.calls.at(-1)?.[0]).toEqual({
      operationId: expect.any(String),
      name: 'Travel'
    })
    const command = capability.createProfile.mock.calls.at(-1)![0]
    publishOperation({
      ...operation(command.operationId, 'profile.create', 'failed'),
      error: { code: 'duplicate_name', message: 'A profile with that name already exists.' }
    })
    expect(await screen.findByText('A profile with that name already exists.')).toBeTruthy()
  })

  it('renames on Enter and enforces deletion constraints before confirmation', async () => {
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='empty' profiles={profiles} />
    )
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText('Rename profile')
    await user.clear(input)
    await user.type(input, 'Archive{Enter}')
    expect(capability.renameProfile.mock.calls.at(-1)?.[0]).toEqual({
      operationId: expect.any(String),
      profileId: 'empty',
      name: 'Archive'
    })

    cleanup()
    const { user: personalUser } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )
    await personalUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    const { user: onlyProfileUser } = render(
      <ProfileSelector capability={capability} currentProfile='empty' profiles={[profiles[2]]} />
    )
    await onlyProfileUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires deletion confirmation and leaves the projection responsible for removal', async () => {
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='empty' profiles={profiles} />
    )
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(capability.deleteProfile.mock.calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(capability.deleteProfile.mock.calls.at(-1)?.[0]).toEqual({
        operationId: expect.any(String),
        profileId: 'empty'
      })
    })
  })

  it('ignores an older delayed profile-selection failure after a newer selection starts', async () => {
    const oldResult = deferred<Awaited<ReturnType<AccountsCapabilityFake['selectProfile']>>>()
    capability.selectProfile
      .mockImplementationOnce(() => oldResult.promise)
      .mockResolvedValueOnce({ ok: true })
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )

    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('option', { name: /Work/ }))
    await user.click(screen.getByRole('option', { name: /Empty/ }))
    await act(async () => {
      oldResult.resolve({ ok: false, error: 'not_found' })
      await oldResult.promise
    })

    expect(capability.selectProfile.mock.calls.map(([input]) => input.profileId)).toEqual(['work', 'empty'])
    expect(screen.queryByText('Could not switch profiles. Try again.')).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('ignores an older delayed create failure after a newer create submission starts', async () => {
    const oldResult = deferred<Awaited<ReturnType<AccountsCapabilityFake['createProfile']>>>()
    capability.createProfile
      .mockImplementationOnce(() => oldResult.promise)
      .mockResolvedValueOnce({ ok: true })
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )

    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.type(screen.getByLabelText('New profile name'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    await user.clear(screen.getByLabelText('New profile name'))
    await user.type(screen.getByLabelText('New profile name'), 'Archive')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    await act(async () => {
      oldResult.resolve({ ok: false, error: 'operation_failed' })
      await oldResult.promise
    })

    expect(capability.createProfile.mock.calls.map(([input]) => input.name)).toEqual(['Travel', 'Archive'])
    expect(screen.queryByText('Could not create the profile. Try again.')).toBeNull()
  })

  it('invalidates a cancelled movable-account request before loading the next create view', async () => {
    const oldResult = deferred<Awaited<ReturnType<AccountsCapabilityFake['listMovableProfileAccounts']>>>()
    capability.listMovableProfileAccounts
      .mockImplementationOnce(() => oldResult.promise)
      .mockResolvedValueOnce({
        ok: true,
        accounts: [{ id: 'new', address: '0x2', name: 'Newest', profileId: 'personal' }]
      })
    const { user } = render(
      <ProfileSelector capability={capability} currentProfile='personal' profiles={profiles} />
    )

    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('button', { name: /Newest/ })).toBeTruthy()
    await act(async () => {
      oldResult.resolve({ ok: false, error: 'operation_failed' })
      await oldResult.promise
    })

    expect(capability.listMovableProfileAccounts.mock.calls).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Newest/ })).toBeTruthy()
    expect(screen.queryByText('Could not load accounts to move.')).toBeNull()
  })
})
