import { expect, it, mock } from 'bun:test'

import { UR, UREncoder } from '@ngraveio/bc-ur'
import { gzipSync, strToU8 } from 'fflate'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import type { QueryResultMap } from '../../../../app/contracts/operations'
import { createQrCameraFake } from '../../../../platform/desktop/renderer/camera.test-support'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
import { createAccountsCapabilityFake } from '../accountsCapability.test-support'
import { AddAccount } from '../AddAccount'
import { RabbyImport } from './RabbyImport'

const fixture = registerTestRuntimeFixture()
const data = JSON.stringify({ vault: { data: 'ciphertext', iv: 'iv', salt: 'salt' } })
const qr = () => new UREncoder(new UR(Buffer.from(gzipSync(strToU8(data))), 'bytes'), 200).nextPart()
const preview = {
  ok: true,
  accounts: [
    { address: `0x${'1'.repeat(40)}`, name: 'Savings', kind: 'mnemonic', duplicate: false },
    { address: `0x${'2'.repeat(40)}`, name: 'Existing', kind: 'private-key', duplicate: true }
  ],
  importCount: 1,
  skipCount: 1,
  unsupportedMetadata: []
} satisfies Extract<QueryResultMap['rabby.preview'], { ok: true }>

it('retries a wrong password, reviews skipped accounts and keeps the completion screen when import selects its new profile', async () => {
  const capability = createAccountsCapabilityFake()
  capability.previewRabby.mockResolvedValueOnce({
    ok: false,
    error: 'import_failed',
    message: 'Incorrect Rabby password'
  })
  capability.previewRabby.mockResolvedValueOnce(preview)
  const camera = createQrCameraFake()
  const onClose = mock()
  const state = walletState({ tray: { open: true, initial: false, homeCommand: null } })
  fixture.state.reset(state)
  const view = render(<AddAccount capability={capability} camera={camera.camera} onClose={onClose} />)
  await view.user.click(screen.getByRole('button', { name: 'Import from Rabby' }))
  await view.user.click(screen.getByRole('button', { name: 'Scan QR' }))
  await waitFor(() => expect(camera.sessions.length).toBe(1))
  await act(async () => {
    camera.sessions[0].handlers.onFrame(qr())
  })
  await view.user.type(screen.getByLabelText('Rabby password'), 'incorrect')
  await view.user.click(screen.getByRole('button', { name: 'Review accounts' }))
  expect(screen.getByRole('alert').textContent).toContain('Incorrect Rabby password')
  await view.user.clear(screen.getByLabelText('Rabby password'))
  await view.user.type(screen.getByLabelText('Rabby password'), 'extension-password')
  await view.user.click(screen.getByRole('button', { name: 'Review accounts' }))
  expect(screen.getByText('Already in Newframe · Skipped')).toBeTruthy()
  await view.user.click(screen.getByRole('button', { name: 'Import 1 account' }))
  const command = capability.importRabby.mock.calls[0][0]
  expect(command.operationId).toBeString()
  expect(command).toEqual({ operationId: command.operationId, data, password: 'extension-password' })
  expect(screen.queryByText('Import complete')).toBeNull()
  act(() =>
    fixture.state.reset({
      ...state,
      currentProfile: 'rabby-profile',
      currentAccount: preview.accounts[0].address,
      operations: {
        [command.operationId]: {
          id: command.operationId,
          type: 'rabby.import',
          status: 'succeeded',
          phase: 'imported_1_skipped_1',
          startedAt: 1,
          updatedAt: 2,
          finishedAt: 2
        }
      }
    })
  )
  expect(await screen.findByText('Import complete')).toBeTruthy()
  expect(screen.getByText('1 account imported')).toBeTruthy()
  expect(screen.getByText('1 existing account skipped')).toBeTruthy()
  expect(screen.queryByLabelText('Rabby password')).toBeNull()
  expect(camera.sessions[0].stopped).toBe(true)
  await view.user.click(screen.getByRole('button', { name: 'View imported accounts' }))
  expect(onClose.mock.calls.length).toBe(1)
})

it('discards the export and an in-flight password response when Newframe locks', async () => {
  const capability = createAccountsCapabilityFake()
  let respond!: (value: QueryResultMap['rabby.preview']) => void
  capability.previewRabby.mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve
      })
  )
  const camera = createQrCameraFake()
  const state = walletState({ tray: { open: true, initial: false, homeCommand: null } })
  fixture.state.reset(state)
  const view = render(
    <RabbyImport
      capability={capability}
      camera={camera.camera}
      vault={{ exists: true, unlocked: true }}
      onBack={mock()}
      onClose={mock()}
    />
  )
  await view.user.click(screen.getByRole('button', { name: 'Scan QR' }))
  await waitFor(() => expect(camera.sessions.length).toBe(1))
  await act(async () => {
    camera.sessions[0].handlers.onFrame(qr())
  })
  await view.user.type(screen.getByLabelText('Rabby password'), 'extension-password')
  await view.user.click(screen.getByRole('button', { name: 'Review accounts' }))
  act(() => fixture.state.reset({ ...state, appLock: { locked: true, vaultExists: true } }))
  await act(async () => {
    respond(preview)
  })
  expect(screen.queryByLabelText('Rabby password')).toBeNull()
  expect(screen.queryByText('Savings')).toBeNull()
  expect(capability.importRabby.mock.calls.length).toBe(0)
  expect(screen.getByRole('button', { name: 'Scan QR' }).hasAttribute('disabled')).toBe(true)
})
