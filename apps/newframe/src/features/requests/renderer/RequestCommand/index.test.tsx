import { beforeEach, expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import { RequestCommand, approveRequest, declineRequest, runWhenAppUnlocked } from './index'
import TxApproval from './TxApproval'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../requestCapabilities.test-support'

let capabilities: RequestRendererCapabilitiesFake

beforeEach(() => {
  capabilities = createRequestPortsFake()
})

const createProps = <const Request extends object>(appLocked: boolean, req: Request) => {
  return {
    capabilities,
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
  approveRequest(capabilities.review, 'request-1')
  declineRequest(capabilities.review, { handlerId: 'request-2' })

  expect(capabilities.review.approve).toHaveBeenCalledWith({ requestId: 'request-1' })
  expect(capabilities.review.reject).toHaveBeenCalledWith({ requestId: 'request-2' })
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

  expect(props.notify).toHaveBeenCalledWith({
    type: 'signerCompatibilityWarning',
    data: {
      req,
      compatibility: { signer: 'ledger', tx: 'london', compatible: false },
      chain: { type: 'ethereum', id: 1 }
    }
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

  expect(capabilities.transaction.replace).toHaveBeenNthCalledWith(1, {
    requestId: req.handlerId,
    replacement: 'cancel',
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/)
  })
  expect(capabilities.transaction.replace).toHaveBeenNthCalledWith(2, {
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

  expect(capabilities.transaction.dismissFeeNotice).toHaveBeenCalledWith({
    requestId: req.handlerId
  })
})

it('uses typed request commands for required approvals', () => {
  const req = { handlerId: 'request-1' }
  const approval = { type: 'approveGasLimit' as const, data: { message: 'Estimated to fail' } }
  render(<TxApproval capability={capabilities.review} req={req} approval={approval} />)

  fireEvent.click(screen.getByText('Proceed'))
  fireEvent.click(screen.getByText('Reject'))

  expect(capabilities.review.confirmApproval).toHaveBeenCalledWith({
    requestId: req.handlerId,
    approvalType: approval.type
  })
  expect(capabilities.review.reject).toHaveBeenCalledWith({
    requestId: req.handlerId
  })
})
