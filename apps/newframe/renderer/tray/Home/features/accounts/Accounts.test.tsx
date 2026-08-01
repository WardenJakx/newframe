import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Mock } from 'bun:test'
import { within } from '@testing-library/react'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../../contracts/state/protocol'
import { walletState } from '../../../../state/fixtures.test-support'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../state/rendererStore'
import { HomeUiProvider } from '../../state/HomeUiProvider'
import { Accounts } from './Accounts'
import { AddAccount } from './AddAccount'
import type { OperationRecord } from '../../../../../domain/state/operation'

const link = createHostFixture()
const account = {
  id: 'account-a',
  profileId: 'personal',
  address: '0x0000000000000000000000000000000000000001',
  name: 'Primary',
  lastSignerType: 'address',
  status: 'ok',
  signer: 'watch',
  requests: {},
  created: '2026-01-01T00:00:00.000Z'
}
const profiles = [
  { id: 'personal', name: 'Personal', accountCount: 1, cachedValue: { state: 'missing' as const } },
  { id: 'work', name: 'Work', accountCount: 0, cachedValue: { state: 'unpriced' as const } }
]
let revision = 0

function publishChanges(changes: Record<string, unknown>) {
  const baseRevision = revision
  revision += 1
  act(() => {
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'accounts-test',
      baseRevision,
      revision,
      changes
    })
  })
}

describe('Accounts profile controls', () => {
  beforeEach(() => {
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })
    revision = 0
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'accounts-test',
      revision: 0,
      state: walletState({
        accounts: { [account.id]: account },
        accountOrder: [account.id],
        currentAccount: account.id,
        currentProfile: 'personal',
        profiles
      })
    })
  })

  it('places the active profile selector immediately left of Close accounts', () => {
    render(
      <HomeUiProvider>
        <Accounts />
      </HomeUiProvider>
    )

    const dialog = screen.getByRole('dialog', { name: 'Accounts' })
    const profile = within(dialog).getByRole('button', { name: 'Select active profile' })
    const close = within(dialog).getByRole('button', { name: 'Close accounts' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.indexOf(profile)).toBe(buttons.indexOf(close) - 1)
    expect(profile.textContent).toContain('Personal')
  })

  it('keeps move failures visible and closes only after operation and account projections succeed', async () => {
    const { user } = render(
      <HomeUiProvider>
        <Accounts />
      </HomeUiProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Primary account actions' }))
    await user.click(screen.getByRole('button', { name: 'Move Primary to profile' }))
    await user.click(screen.getByRole('option', { name: /Work/ }))

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'account.profile-move',
      operationId: expect.any(String),
      accountId: account.id,
      profileId: 'work'
    })
    const failedCommand = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
      operationId: string
      type: string
    }
    publishChanges({
      operations: {
        [failedCommand.operationId]: {
          id: failedCommand.operationId,
          type: failedCommand.type,
          status: 'failed',
          error: { code: 'operation_failed', message: 'Profile operation failed.' },
          startedAt: 1,
          updatedAt: 2,
          finishedAt: 2
        } satisfies OperationRecord
      }
    })
    expect(await screen.findByText('Could not move the account. Try again.')).toBeTruthy()
    await user.click(screen.getByRole('option', { name: /Work/ }))
    const succeededCommand = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
      operationId: string
      type: string
    }
    publishChanges({
      operations: {
        [succeededCommand.operationId]: {
          id: succeededCommand.operationId,
          type: succeededCommand.type,
          status: 'succeeded',
          startedAt: 3,
          updatedAt: 4,
          finishedAt: 4
        } satisfies OperationRecord
      }
    })
    expect(screen.getByText('Primary')).toBeTruthy()
    publishChanges({ accounts: {}, accountOrder: [] })
    await waitFor(() => expect(screen.queryByText('Primary')).toBeNull())
  })
})

describe('AddAccount existing-account selection', () => {
  const currentAddress = '0x0000000000000000000000000000000000000001'
  const targetAddress = '0x0000000000000000000000000000000000000002'
  const targetId = targetAddress.toLowerCase()

  beforeEach(() => {
    resetStateMirrorForTests(
      walletState({
        accounts: {
          [currentAddress]: { ...account, id: currentAddress, address: currentAddress },
          [targetId]: { ...account, id: targetId, address: targetAddress, name: 'Secondary' }
        },
        currentAccount: currentAddress,
        signers: {
          'seed-1': {
            id: 'seed-1',
            type: 'seed',
            name: 'Recovery phrase',
            model: 'seed',
            status: 'ok',
            addresses: [targetAddress],
            appVersion: { major: 1, minor: 0, patch: 0 }
          }
        }
      })
    )
  })

  it('surfaces acknowledgement failure but closes only after currentAccount projects the selection', async () => {
    ;(link.executeCommand as Mock<any>)
      .mockResolvedValueOnce({ ok: false, error: 'not_found', message: 'Account no longer exists.' })
      .mockResolvedValue({ ok: true })
    const onClose = mock()
    const { user } = render(<AddAccount onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Add from stored recovery phrases' }))
    await user.click(screen.getByRole('button', { name: 'Add address' }))
    await user.click(screen.getByRole('button', { name: 'Select Secondary' }))
    expect(await screen.findByText('Account no longer exists.')).toBeTruthy()
    expect(onClose.mock.calls.length).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Select Secondary' }))
    await waitFor(() =>
      expect(link.executeCommand).toHaveBeenLastCalledWith({
        type: 'account.select',
        accountId: targetId
      })
    )
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      resetStateMirrorForTests(
        walletState({
          accounts: {
            [currentAddress]: { ...account, id: currentAddress, address: currentAddress },
            [targetId]: { ...account, id: targetId, address: targetAddress, name: 'Secondary' }
          },
          currentAccount: targetId
        })
      )
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
