import { beforeEach, describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'
import { within } from '@testing-library/react'

import { render, screen, waitFor } from '../../../../../test/support/componentSetup'
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

describe('Accounts profile controls', () => {
  beforeEach(() => {
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

  it('moves an account only through the command and keeps failures actionable', async () => {
    ;(link.executeCommand as Mock<any>).mockResolvedValueOnce({ ok: false, error: 'operation_failed' })
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
      accountId: account.id,
      profileId: 'work'
    })
    expect(await screen.findByText('Could not move the account. Try again.')).toBeTruthy()
    ;(link.executeCommand as Mock<any>).mockResolvedValueOnce({ ok: true })
    await user.click(screen.getByRole('option', { name: /Work/ }))
    await waitFor(() => expect(screen.queryByText('Could not move the account. Try again.')).toBeNull())
    expect(screen.getByText('Primary')).toBeTruthy()
  })
})
