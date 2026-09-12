import { expect, it } from 'bun:test'

import { useState, type ComponentProps } from 'react'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { createQrCameraFake } from '../../../../platform/desktop/renderer/camera.test-support'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
import { createAccountsCapabilityFake } from '../accountsCapability.test-support'
import { AirGapSigning } from './AirGapSigning'

function SigningHost(props: Omit<ComponentProps<typeof AirGapSigning>, 'dismiss'>) {
  const [open, setOpen] = useState(true)
  return open ? <AirGapSigning {...props} dismiss={() => setOpen(false)} /> : <div>Signing closed</div>
}

const fixture = registerTestRuntimeFixture()
const reference = {
  signerId: 'airgap-1',
  requestId: 'request-1',
  sessionId: '9e987c03-ab77-433b-b27b-680b627373c4'
}
const accountId = `0x${'1'.repeat(40)}`
function state(progress = 0) {
  return walletState({
    currentAccount: accountId,
    appLock: { locked: false, vaultExists: true },
    tray: { open: true, initial: false, homeCommand: null },
    accounts: {
      [accountId]: {
        id: accountId,
        profileId: 'default-profile',
        status: 'ok',
        address: accountId,
        name: 'AirGap',
        created: '1',
        lastSignerType: 'airgap',
        signer: reference.signerId,
        requests: {
          [reference.requestId]: {
            handlerId: reference.requestId,
            account: accountId,
            type: 'sign',
            status: 'pending',
            data: '0x1234'
          }
        }
      }
    },
    signers: {
      [reference.signerId]: {
        id: reference.signerId,
        model: 'AirGap',
        appVersion: { major: 1, minor: 0, patch: 0 },
        name: 'AirGap',
        type: 'airgap',
        status: 'ok',
        addresses: [accountId],
        airgapRequest: { requestId: reference.requestId, sessionId: reference.sessionId, progress }
      }
    }
  })
}

it('keeps scanning during progress, pauses when hidden, and releases camera on completion', async () => {
  fixture.state.reset(state())
  const capability = createAccountsCapabilityFake()
  capability.airgapRequest.mockResolvedValue({ ok: true, frames: ['request QR'] })
  const f = createQrCameraFake()
  const view = render(<SigningHost capability={capability} camera={f.camera} reference={reference} />)
  await view.user.click(await screen.findByRole('button', { name: 'Scan signed QR' }))
  act(() => f.sessions[0].handlers.onFrame('response-a'))
  await waitFor(() =>
    expect(capability.airgapScan).toHaveBeenCalledWith({ ...reference, frame: 'response-a' })
  )
  act(() => fixture.state.reset(state(0.5)))
  expect(screen.getByText('Receiving signature: 50%')).toBeTruthy()
  expect(f.sessions).toHaveLength(1)
  const hidden = state(0.5)
  hidden.tray.open = false
  act(() => fixture.state.reset(hidden))
  expect(f.sessions[0].stopped).toBe(true)
  act(() => fixture.state.reset(state(0.5)))
  expect(f.sessions.at(-1)?.stopped).toBe(false)
  await view.user.click(screen.getByRole('button', { name: 'Back to QR' }))
  expect(f.sessions.every((session) => session.stopped)).toBe(true)
  await view.user.click(screen.getByRole('button', { name: 'Scan signed QR' }))
  const complete = state(1)
  delete complete.signers[reference.signerId].airgapRequest
  complete.accounts[accountId].requests[reference.requestId].status = 'success'
  act(() => fixture.state.reset(complete))
  expect(screen.getByText('Signing closed')).toBeTruthy()
  expect(screen.queryByText('Sign with AirGap Vault')).toBeNull()
  expect(f.sessions.every((session) => session.stopped)).toBe(true)
  view.unmount()
  expect(capability.airgapCancel).toHaveBeenCalledWith(reference)
})

it.each(['request', 'account', 'lock'] as const)(
  'dismisses when %s changes and ignores a late QR query',
  async (change) => {
    fixture.state.reset(state())
    const capability = createAccountsCapabilityFake()
    const query = Promise.withResolvers<Awaited<ReturnType<typeof capability.airgapRequest>>>()
    capability.airgapRequest.mockReturnValue(query.promise)
    const view = render(
      <SigningHost capability={capability} camera={createQrCameraFake().camera} reference={reference} />
    )
    const stale = state()
    if (change === 'request') delete stale.accounts[accountId].requests[reference.requestId]
    if (change === 'account') stale.currentAccount = 'other'
    if (change === 'lock') stale.appLock.locked = true
    act(() => fixture.state.reset(stale))
    expect(screen.getByText('Signing closed')).toBeTruthy()
    await act(async () => query.resolve({ ok: true, frames: ['late QR'] }))
    expect(screen.queryByRole('button', { name: 'Scan signed QR' })).toBeNull()
    view.unmount()
    expect(capability.airgapCancel).toHaveBeenCalledWith(reference)
  }
)

it.each(['startup', 'disconnect', 'response'] as const)(
  'opens the camera before scan mode and returns to the QR on %s failure',
  async (failure) => {
    fixture.state.reset(state())
    const capability = createAccountsCapabilityFake()
    capability.airgapRequest.mockResolvedValue({ ok: true, frames: ['request QR'] })
    capability.airgapScan.mockResolvedValue({
      ok: false,
      error: 'operation_failed',
      message: 'Invalid signature QR'
    })
    const f = createQrCameraFake(false)
    const view = render(<SigningHost capability={capability} camera={f.camera} reference={reference} />)
    await view.user.click(await screen.findByRole('button', { name: 'Scan signed QR' }))
    expect(screen.getByLabelText('AirGap signing request QR')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Opening camera' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Back to QR' })).toBeNull()
    expect(f.sessions).toHaveLength(1)
    if (failure !== 'startup') {
      act(() => f.sessions[0].handlers.onReady())
      expect(screen.getByRole('button', { name: 'Back to QR' })).toBeTruthy()
      expect(screen.queryByLabelText('AirGap signing request QR')).toBeNull()
      expect(f.sessions).toHaveLength(1)
    }
    act(() => {
      if (failure === 'response') f.sessions[0].handlers.onFrame('invalid')
      else f.sessions[0].handlers.onError(new DOMException('Denied', 'NotAllowedError'))
    })
    const scanMessage = failure === 'response' ? 'Invalid signature QR' : /Camera access denied/
    expect((await screen.findByText(scanMessage)).closest('[role="alert"]')).not.toBeNull()
    expect(screen.getByLabelText('AirGap signing request QR')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to QR' })).toBeNull()
    expect(f.sessions[0].stopped).toBe(true)
    act(() => f.sessions[0].handlers.onReady())
    expect(screen.queryByRole('button', { name: 'Back to QR' })).toBeNull()
    await view.user.click(screen.getByRole('button', { name: 'Scan signed QR' }))
    expect(screen.queryByText(scanMessage)).toBeNull()
    expect(f.sessions).toHaveLength(2)
    act(() => f.sessions[1].handlers.onReady())
    expect(screen.getByRole('button', { name: 'Back to QR' })).toBeTruthy()
    view.unmount()
    expect(f.sessions[1].stopped).toBe(true)
  }
)
