import { expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { RequestCommand, approveRequest, declineRequest, runWhenAppUnlocked } from './index'
import TxApproval from './TxApproval'

const link = createHostFixture()

const createProps = <const Request extends object>(appLocked: boolean, req: Request) => {
  return {
    notify: mock(),
    req,
    shared: {
      appLocked,
      chain: {},
      explorerWarningMuted: false,
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

it('displays the main-projected signer compatibility gate without querying Electron', () => {
  const req = {
    handlerId: 'request-1',
    type: 'transaction',
    approvals: [],
    data: { chainId: '0x1', gasLimit: '0x5208', gasPrice: '0x1' },
    approvalGate: {
      type: 'signer-compatibility',
      reason: 'incompatible',
      signer: 'ledger',
      tx: 'london',
      chain: { type: 'ethereum', id: 1 }
    }
  } as const
  const props = createProps(false, req)
  render(<RequestCommand {...props} />)

  expect(props.notify).toHaveBeenCalledWith('signerCompatibilityWarning', {
    req,
    compatibility: { signer: 'ledger', tx: 'london', compatible: false },
    chain: { type: 'ethereum', id: 1 }
  })
  expect(link.executeQuery.mock.calls).toEqual([])
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
