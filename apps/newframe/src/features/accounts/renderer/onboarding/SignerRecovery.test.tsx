import { expect, it, mock } from 'bun:test'

import { cleanup, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import SignerRecovery from './SignerRecovery'
import { createAccountsCapabilityFake, type AccountsCapabilityFake } from '../accountsCapability.test-support'

const fixture = registerTestRuntimeFixture()
let capability: AccountsCapabilityFake
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

it('owns hardware recovery sessions, inputs, retry, completion, and external cancellation', async () => {
  capability = createAccountsCapabilityFake()
  fixture.state.reset({ signers: { 'ledger-1': signer() } })
  let view = render(<SignerRecovery capability={capability} dismiss={mock()} signerIds={['ledger-1']} />)

  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  const firstSession = capability.startHardwareSession.mock.calls.at(-1)![0]
  await view.user.click(screen.getByRole('button', { name: 'Retry Connection' }))
  const reload = capability.reloadSigner.mock.calls.at(-1)![0]
  expect(reload).toEqual({
    operationId: expect.any(String),
    signerId: 'ledger-1'
  })
  expect(capability.finishHardwareSession.mock.calls.map(([input]) => input)).toContainEqual({
    operationId: firstSession.operationId,
    signerId: 'ledger-1',
    outcome: 'cancelled'
  })

  view.unmount()
  expect(capability.finishHardwareSession.mock.calls.map(([input]) => input)).toContainEqual({
    operationId: reload.operationId,
    signerId: 'ledger-1',
    outcome: 'cancelled'
  })
  expect(capability.disconnectSigner.mock.calls).toHaveLength(0)

  cleanup()
  capability = createAccountsCapabilityFake()
  fixture.state.reset({
    signers: {
      'trezor-1': signer({ id: 'trezor-1', name: 'Trezor', status: 'need pin', type: 'trezor' })
    }
  })
  view = render(<SignerRecovery capability={capability} dismiss={mock()} signerIds={['trezor-1']} />)
  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  const trezorSession = capability.startHardwareSession.mock.calls.at(-1)![0]

  await view.user.click(screen.getByRole('button', { name: 'PIN position 1' }))
  await view.user.click(screen.getByRole('button', { name: 'PIN position 2' }))
  await view.user.click(screen.getByRole('button', { name: 'Submit PIN' }))

  expect(capability.submitTrezorInput.mock.calls.map(([input]) => input)).toContainEqual({
    operationId: trezorSession.operationId,
    actionId: expect.any(String),
    signerId: 'trezor-1',
    input: 'pin',
    value: '12'
  })

  view.unmount()
  cleanup()
  capability = createAccountsCapabilityFake()
  fixture.state.reset({ signers: { 'ledger-1': signer({ status: 'ok' }) } })
  const dismiss = mock()
  view = render(<SignerRecovery capability={capability} dismiss={dismiss} signerIds={['ledger-1']} />)
  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  const readySession = capability.startHardwareSession.mock.calls.at(-1)![0]

  expect(screen.getByText('Connected and ready to sign')).toBeTruthy()
  await view.user.click(screen.getByRole('button', { name: 'Continue' }))

  expect(capability.finishHardwareSession.mock.calls.map(([input]) => input)).toContainEqual({
    operationId: readySession.operationId,
    signerId: 'ledger-1',
    outcome: 'ready'
  })
  expect(dismiss.mock.calls).toHaveLength(1)
})
