import { beforeEach, describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../platform/state-sync/contract/protocol'
import type { OperationRecord } from '../../../platform/operations/operation'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../platform/state-sync/renderer/rendererStore'
import { ProfileSelector } from './ProfileSelector'

const link = createHostFixture()
const profiles = [
  { id: 'personal', name: 'Personal', accountCount: 2, cachedValue: { state: 'missing' as const } },
  { id: 'work', name: 'Work', accountCount: 1, cachedValue: { state: 'unpriced' as const } },
  { id: 'empty', name: 'Empty', accountCount: 0, cachedValue: { state: 'priced' as const, value: 12.5 } }
]
let revision = 0

function publishOperation(operation: OperationRecord) {
  const baseRevision = revision
  revision += 1
  act(() => {
    applyStateMessage({
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
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })
    revision = 0
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'profiles-test',
      revision: 0,
      state: walletState({ currentProfile: 'personal', profiles, operations: {} })
    })
  })

  it('shows every ordered summary and supports listbox keyboard selection without a dormant query', async () => {
    const { rerender, user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)

    expect(link.executeQuery).not.toHaveBeenCalled()
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
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.select',
      operationId: expect.any(String),
      profileId: 'work'
    })
    const command = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
      operationId: string
      type: string
    }
    expect(screen.getAllByRole('option')).toHaveLength(3)

    publishOperation(operation(command.operationId, command.type, 'succeeded'))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    rerender(<ProfileSelector currentProfile='work' profiles={profiles} />)
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
  })

  it('queries movable accounts only after create opens and creates with selected moves', async () => {
    ;(link.executeQuery as Mock<any>).mockResolvedValueOnce({
      ok: true,
      accounts: [{ id: 'account-1', address: '0x1', name: 'Primary', profileId: 'personal' }]
    })
    const { rerender, user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    expect(link.executeQuery).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(link.executeQuery).toHaveBeenCalledWith({ type: 'profile.movable-accounts' })
    await user.type(screen.getByLabelText('New profile name'), '  Travel  ')
    await user.click(await screen.findByRole('button', { name: /Primary/ }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.create',
      operationId: expect.any(String),
      name: 'Travel',
      accountIds: ['account-1']
    })
    const command = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
      operationId: string
      type: string
    }
    expect(screen.getByLabelText('New profile name')).toBeTruthy()
    publishOperation({
      ...operation(command.operationId, command.type, 'succeeded'),
      entityRefs: [{ type: 'profile', id: 'new-profile' }]
    })
    expect(screen.getByLabelText('New profile name')).toBeTruthy()
    rerender(
      <ProfileSelector
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
    ;(link.executeQuery as Mock<any>).mockResolvedValueOnce({ ok: true, accounts: [] })
    const { user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(screen.getByText('Enter a profile name between 1 and 50 characters.')).toBeTruthy()
    expect(link.executeCommand).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('New profile name'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.create',
      operationId: expect.any(String),
      name: 'Travel'
    })
    const command = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
      operationId: string
      type: string
    }
    publishOperation({
      ...operation(command.operationId, command.type, 'failed'),
      error: { code: 'duplicate_name', message: 'A profile with that name already exists.' }
    })
    expect(await screen.findByText('A profile with that name already exists.')).toBeTruthy()
  })

  it('renames on Enter and enforces deletion constraints before confirmation', async () => {
    const { user } = render(<ProfileSelector currentProfile='empty' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText('Rename profile')
    await user.clear(input)
    await user.type(input, 'Archive{Enter}')
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.rename',
      operationId: expect.any(String),
      profileId: 'empty',
      name: 'Archive'
    })

    cleanup()
    const { user: personalUser } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    await personalUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    const { user: onlyProfileUser } = render(
      <ProfileSelector currentProfile='empty' profiles={[profiles[2]]} />
    )
    await onlyProfileUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires deletion confirmation and leaves the projection responsible for removal', async () => {
    const { user } = render(<ProfileSelector currentProfile='empty' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(link.executeCommand).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(link.executeCommand).toHaveBeenCalledWith({
        type: 'profile.delete',
        operationId: expect.any(String),
        profileId: 'empty'
      })
    })
  })
})
