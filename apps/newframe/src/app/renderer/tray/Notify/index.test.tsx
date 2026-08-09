import { expect, it } from 'bun:test'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { TrayNotificationProvider, useTrayNotification } from '../notification'
import Notification from './index'
import { createRequestRendererCapabilities as createRequestPorts } from '../../../../features/requests/renderer/requestCapabilities'
import { createHomeCapability } from '../Home/homeCapability'

const fixture = registerTestRuntimeFixture()
const lazyCommandHost = {
  executeCommand: (command: Parameters<typeof fixture.client.executeCommand>[0]) =>
    fixture.client.executeCommand(command)
}
const requestPorts = createRequestPorts(lazyCommandHost)
const notificationCapabilities = {
  external: requestPorts.external,
  home: createHomeCapability(lazyCommandHost),
  review: requestPorts.review
}

function WarningFixture() {
  const { notify } = useTrayNotification()
  return (
    <>
      <button
        onClick={() =>
          notify('signerCompatibilityWarning', {
            req: { handlerId: 'request-a' },
            compatibility: { signer: 'ledger', tx: 'london', compatible: false }
          })
        }
      >
        Compatibility warning
      </button>
      <button
        onClick={() =>
          notify('gasFeeWarning', {
            req: { handlerId: 'request-a' },
            feeUSD: '51.00',
            currentSymbol: 'ETH'
          })
        }
      >
        Gas warning
      </button>
    </>
  )
}

it('keeps an extension response visible until projected notify state confirms completion', async () => {
  const extensionView = {
    notify: 'extensionConnect',
    notifyData: { id: 'extension-a', browser: 'firefox' },
    notifications: {},
    badge: ''
  }
  fixture.state.reset(walletState({ view: extensionView }))
  const { user } = render(
    <TrayNotificationProvider>
      <Notification {...notificationCapabilities} />
    </TrayNotificationProvider>
  )

  await user.click(screen.getByRole('button', { name: 'Accept' }))
  expect(fixture.client.executeCommand).toHaveBeenCalledWith({
    type: 'extension.respond',
    extensionId: 'extension-a',
    approved: true
  })
  expect(screen.getByRole('dialog', { name: 'Extension connection request' })).toBeTruthy()

  act(() => {
    fixture.state.reset(walletState({ view: { ...extensionView, notify: '', notifyData: {} } }))
  })
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Extension connection request' })).toBeNull()
  })
})

it('confirms only the exact warning gate projected by main', async () => {
  fixture.state.reset(walletState({}))
  const { user } = render(
    <TrayNotificationProvider>
      <WarningFixture />
      <Notification {...notificationCapabilities} />
    </TrayNotificationProvider>
  )

  await user.click(screen.getByRole('button', { name: 'Compatibility warning' }))
  await user.click(screen.getByRole('button', { name: 'Proceed' }))
  expect(fixture.client.executeCommand).toHaveBeenCalledWith({
    type: 'request.warning-confirm',
    requestId: 'request-a',
    gate: 'signer-compatibility'
  })

  await user.click(screen.getByRole('button', { name: 'Gas warning' }))
  await user.click(screen.getByRole('button', { name: 'Proceed' }))
  expect(fixture.client.executeCommand).toHaveBeenCalledWith({
    type: 'request.warning-confirm',
    requestId: 'request-a',
    gate: 'gas-fee'
  })
})
