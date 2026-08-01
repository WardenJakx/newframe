import { expect, it, mock } from 'bun:test'
import type { Mock } from 'bun:test'

import { cleanup, render, screen, waitFor } from '../../../test/support/componentSetup'
import { createHostFixture } from '../../../test/support/rendererClient'
import { resetStateMirrorForTests } from '../../state/rendererStore'
import SignerRecovery from './SignerRecovery'

const link = createHostFixture()
const signer = (update: Record<string, unknown> = {}) => ({
  addresses: [],
  appVersion: { major: 1, minor: 0, patch: 0 },
  id: 'ledger-1',
  model: 'Nano',
  name: 'Ledger',
  status: 'disconnected',
  type: 'ledger',
  ...update
})

const commands = (): Array<Record<string, any>> =>
  ((link.executeCommand as any).mock.calls as Array<[Record<string, any>]>).map(([command]) => command)
const commandOfType = (type: string): Record<string, any> => {
  const command = commands().find((candidate) => candidate.type === type)
  if (!command) throw new Error(`Missing ${type} command`)
  return command
}

it('owns hardware recovery sessions, inputs, retry, completion, and external cancellation', async () => {
  resetStateMirrorForTests({ signers: { 'ledger-1': signer() } })
  let view = render(<SignerRecovery dismiss={mock()} signerIds={['ledger-1']} />)

  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  const firstSession = commandOfType('signer.hardware-session-start')
  await view.user.click(screen.getByRole('button', { name: 'Retry Connection' }))
  const reload = commandOfType('signer.reload')
  expect(reload).toEqual({
    type: 'signer.reload',
    operationId: expect.any(String),
    signerId: 'ledger-1'
  })
  expect(commands()).toContainEqual({
    type: 'signer.hardware-session-finish',
    operationId: firstSession.operationId,
    signerId: 'ledger-1',
    outcome: 'cancelled'
  })

  view.unmount()
  expect(commands()).toContainEqual({
    type: 'signer.hardware-session-finish',
    operationId: reload.operationId,
    signerId: 'ledger-1',
    outcome: 'cancelled'
  })
  expect(commands().some(({ type }) => type === 'signer.disconnect')).toBe(false)

  cleanup()
  ;(link.executeCommand as Mock<any>).mockReset().mockResolvedValue({ ok: true })
  resetStateMirrorForTests({
    signers: {
      'trezor-1': signer({ id: 'trezor-1', name: 'Trezor', status: 'need pin', type: 'trezor' })
    }
  })
  view = render(<SignerRecovery dismiss={mock()} signerIds={['trezor-1']} />)
  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  const trezorSession = commandOfType('signer.hardware-session-start')

  await view.user.click(screen.getByRole('button', { name: 'PIN position 1' }))
  await view.user.click(screen.getByRole('button', { name: 'PIN position 2' }))
  await view.user.click(screen.getByRole('button', { name: 'Submit PIN' }))

  expect(commands()).toContainEqual({
    type: 'signer.trezor-input',
    operationId: trezorSession.operationId,
    actionId: expect.any(String),
    signerId: 'trezor-1',
    input: 'pin',
    value: '12'
  })

  view.unmount()
  cleanup()
  ;(link.executeCommand as Mock<any>).mockReset().mockResolvedValue({ ok: true })
  resetStateMirrorForTests({ signers: { 'ledger-1': signer({ status: 'ok' }) } })
  const dismiss = mock()
  view = render(<SignerRecovery dismiss={dismiss} signerIds={['ledger-1']} />)
  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  const readySession = commandOfType('signer.hardware-session-start')

  expect(screen.getByText('Connected and ready to sign')).toBeTruthy()
  await view.user.click(screen.getByRole('button', { name: 'Continue' }))

  expect(commands()).toContainEqual({
    type: 'signer.hardware-session-finish',
    operationId: readySession.operationId,
    signerId: 'ledger-1',
    outcome: 'ready'
  })
  expect(dismiss.mock.calls).toHaveLength(1)
})
