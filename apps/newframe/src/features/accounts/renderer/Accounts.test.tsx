import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { within } from '@testing-library/react'

import { act, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../platform/state-sync/contract/protocol'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { Accounts } from './Accounts'
import { AddAccount } from './AddAccount'
import type { OperationRecord } from '../../../platform/operations/operation'
import { createAccountsCapabilityFake, type AccountsCapabilityFake } from './accountsCapability.test-support'

const fixture = registerTestRuntimeFixture()
let capability: AccountsCapabilityFake
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

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function publishChanges(changes: Record<string, unknown>) {
  const baseRevision = revision
  revision += 1
  act(() => {
    fixture.state.applyStateMessage({
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
    capability = createAccountsCapabilityFake()
    revision = 0
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage({
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
    render(<Accounts capability={capability} onClose={mock()} />)

    const dialog = screen.getByRole('dialog', { name: 'Accounts' })
    const profile = within(dialog).getByRole('button', { name: 'Select active profile' })
    const close = within(dialog).getByRole('button', { name: 'Close accounts' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.indexOf(profile)).toBe(buttons.indexOf(close) - 1)
    expect(profile.textContent).toContain('Personal')
  })

  it('keeps move failures visible and closes only after operation and account projections succeed', async () => {
    const { user } = render(<Accounts capability={capability} onClose={mock()} />)
    await user.click(screen.getByRole('button', { name: 'Primary account actions' }))
    await user.click(screen.getByRole('button', { name: 'Move Primary to profile' }))
    await user.click(screen.getByRole('option', { name: /Work/ }))

    expect(capability.moveAccountToProfile).toHaveBeenCalledWith({
      operationId: expect.any(String),
      accountId: account.id,
      profileId: 'work'
    })
    const failedCommand = capability.moveAccountToProfile.mock.calls.at(-1)![0]
    publishChanges({
      operations: {
        [failedCommand.operationId]: {
          id: failedCommand.operationId,
          type: 'account.profile-move',
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
    const succeededCommand = capability.moveAccountToProfile.mock.calls.at(-1)![0]
    publishChanges({
      operations: {
        [succeededCommand.operationId]: {
          id: succeededCommand.operationId,
          type: 'account.profile-move',
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

  for (const staleOutcome of ['acknowledgement failure', 'thrown rejection'] as const) {
    it(`keeps the newer overlapping profile move active after an older ${staleOutcome}`, async () => {
      const staleMove = deferred<Awaited<ReturnType<AccountsCapabilityFake['moveAccountToProfile']>>>()
      capability.moveAccountToProfile
        .mockImplementationOnce(() => staleMove.promise)
        .mockResolvedValueOnce({ ok: true })
      const { user } = render(<Accounts capability={capability} onClose={mock()} />)
      await user.click(screen.getByRole('button', { name: 'Primary account actions' }))
      await user.click(screen.getByRole('button', { name: 'Move Primary to profile' }))
      await user.click(screen.getByRole('option', { name: /Work/ }))
      await user.click(screen.getByRole('option', { name: /Work/ }))
      const moveInputs = capability.moveAccountToProfile.mock.calls.map(([input]) => input)
      const currentMove = moveInputs[1]!

      await act(async () => {
        if (staleOutcome === 'acknowledgement failure') {
          staleMove.resolve({ ok: false, error: 'operation_failed' })
          await staleMove.promise
        } else {
          staleMove.reject(new Error('stale move rejection'))
          await staleMove.promise.catch(() => undefined)
        }
      })

      expect(moveInputs).toHaveLength(2)
      expect(screen.queryByText('Could not move the account. Try again.')).toBeNull()
      expect(screen.getByRole('option', { name: /Work/ })).toBeTruthy()

      publishChanges({
        operations: {
          [currentMove.operationId]: {
            id: currentMove.operationId,
            type: 'account.profile-move',
            status: 'failed',
            error: { code: 'operation_failed', message: 'Current profile move failed.' },
            startedAt: 3,
            updatedAt: 4,
            finishedAt: 4
          } satisfies OperationRecord
        }
      })
      expect(await screen.findByText('Could not move the account. Try again.')).toBeTruthy()
    })
  }

  it('exports a hot account private key only through the focused query and clipboard capability', async () => {
    const hotAccount = {
      ...account,
      id: account.address,
      lastSignerType: 'seed',
      signer: 'seed-1'
    }
    fixture.state.reset(
      walletState({
        accounts: { [hotAccount.id]: hotAccount },
        accountOrder: [hotAccount.id],
        currentAccount: hotAccount.id,
        currentProfile: 'personal',
        profiles
      })
    )
    const privateKey = `0x${'a'.repeat(64)}`
    capability.exportAccountPrivateKey.mockResolvedValueOnce({ ok: true, privateKey })
    const { user } = render(<Accounts capability={capability} onClose={mock()} />)

    await user.click(screen.getByRole('button', { name: 'Primary account actions' }))
    await user.click(screen.getByRole('button', { name: 'Export private key' }))
    await user.type(screen.getByLabelText('Private key export password'), 'frame-password')
    await user.click(screen.getByRole('button', { name: 'Unlock Primary' }))
    await user.click(await screen.findByRole('button', { name: 'Copy key' }))

    expect(capability.exportAccountPrivateKey.mock.calls.at(-1)?.[0]).toEqual({
      accountId: hotAccount.address,
      password: 'frame-password'
    })
    expect(capability.writeClipboard.mock.calls.at(-1)?.[0]).toEqual({
      text: privateKey
    })
  })

  it('invalidates a pending private-key export when the export panel closes', async () => {
    const hotAccount = { ...account, id: account.address, lastSignerType: 'seed', signer: 'seed-1' }
    fixture.state.reset(
      walletState({
        accounts: { [hotAccount.id]: hotAccount },
        accountOrder: [hotAccount.id],
        currentAccount: hotAccount.id,
        currentProfile: 'personal',
        profiles
      })
    )
    let resolveExport!: (result: { ok: true; privateKey: string }) => void
    capability.exportAccountPrivateKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve
        })
    )
    const { user } = render(<Accounts capability={capability} onClose={mock()} />)
    await user.click(screen.getByRole('button', { name: 'Primary account actions' }))
    await user.click(screen.getByRole('button', { name: 'Export private key' }))
    await user.type(screen.getByLabelText('Private key export password'), 'frame-password')
    await user.click(screen.getByRole('button', { name: 'Unlock Primary' }))
    await user.click(screen.getByRole('button', { name: 'Back to accounts' }))

    const privateKey = `0x${'b'.repeat(64)}`
    await act(async () => {
      resolveExport({ ok: true, privateKey })
      await Promise.resolve()
    })
    expect(screen.queryByText(privateKey)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy key' })).toBeNull()
    expect(screen.getByText('Primary')).toBeTruthy()
  })
})

describe('AddAccount existing-account selection', () => {
  const currentAddress = '0x0000000000000000000000000000000000000001'
  const targetAddress = '0x0000000000000000000000000000000000000002'
  const targetId = targetAddress.toLowerCase()

  beforeEach(() => {
    capability = createAccountsCapabilityFake()
    fixture.state.reset(
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
    capability.selectAccount
      .mockResolvedValueOnce({ ok: false, error: 'not_found', message: 'Account no longer exists.' })
      .mockResolvedValue({ ok: true })
    const onClose = mock()
    const { user } = render(<AddAccount capability={capability} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Add from stored recovery phrases' }))
    await user.click(screen.getByRole('button', { name: 'Add address' }))
    await user.click(screen.getByRole('button', { name: 'Select Secondary' }))
    expect(await screen.findByText('Account no longer exists.')).toBeTruthy()
    expect(onClose.mock.calls.length).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Select Secondary' }))
    await waitFor(() =>
      expect(capability.selectAccount).toHaveBeenLastCalledWith({
        accountId: targetId
      })
    )
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      fixture.state.reset(
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
