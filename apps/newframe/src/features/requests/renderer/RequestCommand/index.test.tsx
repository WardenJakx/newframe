import { beforeEach, expect, it, mock } from 'bun:test'

import { act, fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import RequestCommandContainer, {
  RequestCommand,
  approveRequest,
  declineRequest,
  runWhenAppUnlocked,
  type RequestCommandNotifier
} from './index'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
import { RequestViewProvider } from '../requestView'
import TxApproval from './TxApproval'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../requestCapabilities.test-support'

let capabilities: RequestRendererCapabilitiesFake
const fixture = registerTestRuntimeFixture()

beforeEach(() => {
  capabilities = createRequestPortsFake()
})

const createProps = <const Request extends object>(
  appLocked: boolean,
  req: Request,
  signerAttached = true
) => {
  return {
    capabilities,
    notify: mock(),
    req,
    shared: {
      appLocked,
      chain: {},
      explorerWarningMuted: false,
      signerAttached,
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

it.each([
  {
    type: 'transaction',
    approvals: [],
    data: { chainId: '0x1', gasLimit: '0x5208', gasPrice: '0x1' },
    approvalGate: { type: 'signer-compatibility', reason: 'no-signer' }
  },
  {
    type: 'sign',
    data: '0x1234',
    approvalGate: { type: 'signer-compatibility', reason: 'no-signer' }
  }
] as const)('disables $type requests when no signer is attached', (request) => {
  const req = { ...request, handlerId: 'request-1' }
  const props = createProps(false, req, false)
  render(<RequestCommand {...props} />)

  expect((screen.getByRole('button', { name: 'No signer attached' }) as HTMLButtonElement).disabled).toBe(
    true
  )
  expect(props.notify).not.toHaveBeenCalled()
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

it('keeps the connected transaction review mounted when an AirGap session appears and progresses', () => {
  const accountId = `0x${'1'.repeat(40)}`
  const reference = { signerId: 'airgap-1', requestId: 'request-1', sessionId: 'session-1' }
  const req = {
    handlerId: reference.requestId,
    account: accountId,
    type: 'transaction',
    data: { chainId: '0x7a69', gasLimit: '0x5208', gasPrice: '0x1' }
  }
  const state = walletState({
    currentAccount: accountId,
    accounts: {
      [accountId]: {
        id: accountId,
        address: accountId,
        profileId: 'default-profile',
        name: 'AirGap',
        lastSignerType: 'airgap',
        created: '1',
        status: 'ok',
        signer: reference.signerId,
        requests: {}
      }
    },
    signers: {
      [reference.signerId]: {
        id: reference.signerId,
        type: 'airgap',
        model: 'AirGap',
        name: 'AirGap',
        status: 'ok',
        appVersion: { major: 1, minor: 0, patch: 0 },
        addresses: [accountId]
      }
    }
  })
  fixture.state.reset(state)
  const notifications: Parameters<RequestCommandNotifier>[0][] = []
  const notify: RequestCommandNotifier = (notification) => notifications.push(notification)
  const view = render(
    <RequestViewProvider>
      <RequestCommandContainer capabilities={capabilities} notify={notify} req={req} />
    </RequestViewProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
  expect(capabilities.review.approve).toHaveBeenCalledWith({ requestId: req.handlerId })
  expect(notifications).toEqual([])
  const pending = { ...req, status: 'pending', notice: 'See signer' }
  view.rerender(
    <RequestViewProvider>
      <RequestCommandContainer capabilities={capabilities} notify={notify} req={pending} />
    </RequestViewProvider>
  )
  const projected = structuredClone(state)
  projected.signers[reference.signerId].airgapRequest = {
    requestId: 'unrelated',
    sessionId: reference.sessionId,
    progress: 0
  }
  act(() => fixture.state.reset(projected))
  expect(notifications).toEqual([])
  projected.signers[reference.signerId].airgapRequest!.requestId = reference.requestId
  act(() => fixture.state.reset(structuredClone(projected)))
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
  expect(notifications).toEqual([{ type: 'airgapSigning', data: reference }])
  const progressed = structuredClone(projected)
  progressed.signers[reference.signerId].airgapRequest!.progress = 0.5
  act(() => fixture.state.reset(progressed))
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
  expect(notifications).toEqual([{ type: 'airgapSigning', data: reference }])
  act(() => fixture.state.reset(state))
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy()
})
