import { expect, it, jest } from 'bun:test'

import { fireEvent, render, screen } from '../../../../componentSetup'
import { linkMock as link } from '../../../../bun.mocks'
import { RequestCommand } from '../../../../../app/tray/Footer/RequestCommand'
import TxApproval from '../../../../../app/tray/Footer/RequestCommand/TxApproval'

const createCommand = (appLocked: boolean, req: Record<string, unknown> = {}) => {
  const command = new RequestCommand({
    notify: jest.fn(),
    req,
    shared: {
      appLocked,
      chain: {},
      chainMeta: {},
      explorerWarningMuted: false,
      gasFeeWarningMuted: false,
      signerCompatibilityWarningMuted: false,
      step: 'confirm'
    }
  })
  return command
}

it('uses synchronized lock state instead of querying Electron before signing', () => {
  const next = jest.fn()

  createCommand(true).ensureAppUnlocked(next)
  expect(next).not.toHaveBeenCalled()

  createCommand(false).ensureAppUnlocked(next)
  expect(next).toHaveBeenCalledTimes(1)
})

it('approves and rejects requests using canonical IDs', () => {
  const command = createCommand(false)

  command.approve('request-1')
  command.decline({ handlerId: 'request-2' })

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.approve',
    requestId: 'request-1'
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.reject',
    requestId: 'request-2'
  })
})

it('preserves signer warnings around the typed compatibility query', async () => {
  const req = { handlerId: 'request-1' }
  const command = createCommand(false, req)
  const next = jest.fn()

  link.executeQuery.mockResolvedValueOnce({ ok: false, error: 'no_signer', message: 'No signer' })
  await command.withSignerCompatibility(req, next)
  expect(command.props.notify).toHaveBeenCalledWith('noSignerWarning', { req })
  expect(next).not.toHaveBeenCalled()

  link.executeQuery.mockResolvedValueOnce({
    ok: false,
    error: 'signer_unavailable',
    message: 'Reconnect signer'
  })
  link.executeCommand.mockResolvedValueOnce({ ok: true })
  await command.withSignerCompatibility(req, next)
  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'request.signer-recovery-open',
    requestId: req.handlerId
  })

  const compatibility = { signer: 'ledger', tx: 'london', compatible: false }
  link.executeQuery.mockResolvedValueOnce({ ok: true, compatibility })
  await command.withSignerCompatibility(req, next)
  expect(next).toHaveBeenCalledWith(compatibility)
  expect(link.executeQuery).toHaveBeenLastCalledWith({
    type: 'request.signer-compatibility',
    requestId: req.handlerId
  })
})

it('uses renderer-generated idempotency keys for transaction replacement', () => {
  const req = {
    handlerId: 'request-1',
    status: 'sent',
    notice: 'Submitted',
    data: { chainId: '0x1' },
    tx: { hash: `0x${'1'.repeat(64)}` }
  }
  const command = createCommand(false, req)
  render(<>{command.sentStatus()}</>)

  fireEvent.click(screen.getByLabelText('Cancel transaction'))
  fireEvent.click(screen.getByLabelText('Speed up transaction'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'transaction.replace',
    requestId: req.handlerId,
    replacement: 'cancel',
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/)
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'transaction.replace',
    requestId: req.handlerId,
    replacement: 'speed',
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/)
  })
})

it('dismisses fee notices through the typed transaction command', () => {
  const req = { handlerId: 'request-1', automaticFeeUpdateNotice: {} }
  const command = createCommand(false, req)
  render(<>{command.renderPopBar()}</>)

  fireEvent.click(screen.getByText('Ok'))

  expect(link.executeCommand).toHaveBeenCalledWith({
    type: 'transaction.fee-notice-dismiss',
    requestId: req.handlerId
  })
})

it('uses typed request commands for required approvals', () => {
  const req = { handlerId: 'request-1' }
  const approval = { type: 'approveGasLimit' as const, data: { message: 'Estimated to fail' } }
  render(<TxApproval req={req} approval={approval} />)

  fireEvent.click(screen.getByText('Proceed'))
  fireEvent.click(screen.getByText('Reject'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.approval-confirm',
    requestId: req.handlerId,
    approvalType: approval.type
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.reject',
    requestId: req.handlerId
  })
})
