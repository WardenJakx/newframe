import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../componentSetup'
import { resetStateMirrorForTests } from '../../../../../app/state/rendererStore'
import SignerRecovery from '../../../../../app/tray/Notify/SignerRecovery'
import link from '../../../../../resources/link'

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

it('retries a disconnected hardware wallet from the tray notification', async () => {
  resetStateMirrorForTests({ signers: { 'ledger-1': signer() } })
  const { user } = render(<SignerRecovery dismiss={mock()} signerIds={['ledger-1']} />)

  await user.click(screen.getByRole('button', { name: 'Retry Connection' }))

  expect(link.executeCommand).toHaveBeenCalledWith({ type: 'signer.reload', signerId: 'ledger-1' })
})

it('submits Trezor PIN positions without exposing the PIN digits', async () => {
  resetStateMirrorForTests({
    signers: {
      'trezor-1': signer({ id: 'trezor-1', name: 'Trezor', status: 'need pin', type: 'trezor' })
    }
  })
  const { user } = render(<SignerRecovery dismiss={mock()} signerIds={['trezor-1']} />)

  await user.click(screen.getByRole('button', { name: 'PIN position 1' }))
  await user.click(screen.getByRole('button', { name: 'PIN position 2' }))
  await user.click(screen.getByRole('button', { name: 'Submit PIN' }))

  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'signer.trezor-input',
    signerId: 'trezor-1',
    input: 'pin',
    value: '12'
  })
})

it('returns to the pending request after the hardware wallet is ready', async () => {
  resetStateMirrorForTests({ signers: { 'ledger-1': signer({ status: 'ok' }) } })
  const dismiss = mock()
  const { user } = render(<SignerRecovery dismiss={dismiss} signerIds={['ledger-1']} />)

  expect(screen.getByText('Connected and ready to sign')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  expect(dismiss).toHaveBeenCalledTimes(1)
})
