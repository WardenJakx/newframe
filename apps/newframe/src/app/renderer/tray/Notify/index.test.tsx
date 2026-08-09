import { expect, it } from 'bun:test'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { resetStateMirrorForTests } from '../../../../platform/state-sync/renderer/rendererStore'
import { TrayNotificationProvider, useTrayNotification } from '../notification'
import Notification from './index'

const link = createHostFixture()

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
  resetStateMirrorForTests(walletState({ view: extensionView }))
  const { user } = render(
    <TrayNotificationProvider>
      <Notification />
    </TrayNotificationProvider>
  )

  await user.click(screen.getByRole('button', { name: 'Accept' }))
  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'extension.respond',
    extensionId: 'extension-a',
    approved: true
  })
  expect(screen.getByRole('dialog', { name: 'Extension connection request' })).toBeTruthy()

  act(() => {
    resetStateMirrorForTests(walletState({ view: { ...extensionView, notify: '', notifyData: {} } }))
  })
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Extension connection request' })).toBeNull()
  })
})

it('confirms only the exact warning gate projected by main', async () => {
  resetStateMirrorForTests(walletState({}))
  const { user } = render(
    <TrayNotificationProvider>
      <WarningFixture />
      <Notification />
    </TrayNotificationProvider>
  )

  await user.click(screen.getByRole('button', { name: 'Compatibility warning' }))
  await user.click(screen.getByRole('button', { name: 'Proceed' }))
  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'request.warning-confirm',
    requestId: 'request-a',
    gate: 'signer-compatibility'
  })

  await user.click(screen.getByRole('button', { name: 'Gas warning' }))
  await user.click(screen.getByRole('button', { name: 'Proceed' }))
  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'request.warning-confirm',
    requestId: 'request-a',
    gate: 'gas-fee'
  })
})
