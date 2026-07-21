import { expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../componentSetup'
import { linkMock as link } from '../../../../bun.mocks'
import {
  RequestCommand,
  approveRequest,
  checkSignerCompatibility,
  declineRequest,
  runWhenAppUnlocked
} from '../../../../../app/tray/Footer/RequestCommand'
import TxApproval from '../../../../../app/tray/Footer/RequestCommand/TxApproval'

const createProps = <const Request extends object>(appLocked: boolean, req: Request) => {
  return {
    notify: mock(),
    req,
    shared: {
      appLocked,
      chain: {},
      chainMeta: { nativeCurrency: {} },
      explorerWarningMuted: false,
      gasFeeWarningMuted: false,
      signerCompatibilityWarningMuted: false,
      step: 'confirm' as const
    }
  }
}

it('uses synchronized lock state instead of querying Electron before signing', () => {
  const next = mock()

  runWhenAppUnlocked(true, next)
  expect(next).not.toHaveBeenCalled()

  runWhenAppUnlocked(false, next)
  expect(next).toHaveBeenCalledTimes(1)
})

it('approves and rejects requests using canonical IDs', () => {
  approveRequest('request-1')
  declineRequest({ handlerId: 'request-2' })

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
  const props = createProps(false, req)
  const next = mock()

  link.executeQuery.mockResolvedValueOnce({ ok: false, error: 'no_signer', message: 'No signer' })
  await checkSignerCompatibility(req, props.notify, mock(), next)
  expect(props.notify).toHaveBeenCalledWith('noSignerWarning', { req })
  expect(next).not.toHaveBeenCalled()

  link.executeQuery.mockResolvedValueOnce({
    ok: false,
    error: 'signer_unavailable',
    message: 'Reconnect signer',
    signerIds: ['ledger-1']
  })
  await checkSignerCompatibility(req, props.notify, mock(), next)
  expect(props.notify).toHaveBeenCalledWith('signerRecovery', {
    req,
    signerIds: ['ledger-1']
  })

  const compatibility = { signer: 'ledger', tx: 'london', compatible: false }
  link.executeQuery.mockResolvedValueOnce({ ok: true, compatibility })
  await checkSignerCompatibility(req, props.notify, mock(), next)
  expect(next).toHaveBeenCalledWith(compatibility)
  expect(link.executeQuery).toHaveBeenLastCalledWith({
    type: 'request.signer-compatibility',
    requestId: req.handlerId
  })
})

it('uses renderer-generated idempotency keys for transaction replacement', () => {
  const req = {
    type: 'transaction',
    handlerId: 'request-1',
    status: 'sent',
    notice: 'Submitted',
    data: { chainId: '0x1' },
    tx: { hash: `0x${'1'.repeat(64)}` }
  }
  render(<RequestCommand {...createProps(false, req)} />)

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
  const req = {
    type: 'transaction',
    handlerId: 'request-1',
    automaticFeeUpdateNotice: {},
    approvals: [],
    data: { chainId: '0x1', gasLimit: '0x0', gasPrice: '0x0' }
  }
  render(<RequestCommand {...createProps(false, req)} />)

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
