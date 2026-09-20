import { beforeEach, expect, it, mock } from 'bun:test'

import { act, fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
import type { SigningCandidate } from '../../contract/requests'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../requestCapabilities.test-support'
import { RequestViewProvider } from '../requestView'
import RequestCommandContainer, {
  RequestCommand,
  approveRequest,
  declineRequest,
  runWhenAppUnlocked,
  type RequestCommandNotifier,
  type RequestCommandRequest
} from './index'
import TxApproval from './TxApproval'

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
      transactionSignerAttached: signerAttached,
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

it('submits local adjustments and shows approval failure without modifying the canonical request', async () => {
  const req = {
    type: 'transaction',
    handlerId: 'request-1',
    approvals: [],
    data: { chainId: '0x1', gasPrice: '0x1' }
  }
  capabilities.review.approve.mockResolvedValueOnce({
    ok: false,
    error: 'operation_failed',
    message: 'Invalid fee'
  })
  render(<RequestCommand {...createProps(false, req)} adjustments={{ gasPrice: '0x2' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
  await act(() => Promise.resolve())
  expect(capabilities.review.approve).toHaveBeenCalledWith({
    requestId: 'request-1',
    adjustments: { gasPrice: '0x2' }
  })
  expect(screen.getByRole('alert').textContent).toBe('Invalid fee')
  expect(req.data.gasPrice).toBe('0x1')
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
    signingCapability: {
      type: 'direct',
      status: 'unavailable',
      candidates: [] as SigningCandidate[]
    },
    approvalGate: { type: 'signer-compatibility', reason: 'no-signer' }
  }
] as const)('disables $type requests when no signer is attached', (request) => {
  const req = { ...request, handlerId: 'request-1' }
  const props = createProps(false, req, false)
  render(<RequestCommand {...props} />)

  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'No signer attached' }).disabled).toBe(true)
  expect(props.notify).not.toHaveBeenCalled()
})

it('uses the projected signature capability instead of a direct account signer attachment', () => {
  const owner = safeOwner(1)
  const req: RequestCommandRequest = {
    type: 'sign',
    handlerId: 'request-1',
    signingCapability: { type: 'direct', status: 'ready', candidates: [owner] }
  }
  render(<RequestCommand {...createProps(false, req, false)} />)

  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign' }).disabled).toBe(false)
})

const safeOwner = (index: number, status: 'ready' | 'unavailable' = 'ready') => ({
  accountId: `owner-${index}`,
  name: `Owner ${index}`,
  address: `0x${String(index).repeat(40)}`,
  created: String(index),
  signerType: 'seed',
  signerAttached: true,
  signerStatus: status === 'ready' ? 'ok' : 'Signer unavailable',
  status
})

it('explains when the Safe is not configured on the request chain', () => {
  const req: RequestCommandRequest = {
    type: 'sign',
    handlerId: 'safe-request',
    account: `0x${'a'.repeat(40)}`,
    signingCapability: {
      type: 'safe',
      status: 'unavailable',
      chainId: 1,
      configured: false,
      threshold: 0,
      coordination: 'service',
      candidates: []
    }
  }
  const props = createProps(false, req, false)
  props.shared.chain = { name: 'Ethereum' }
  render(<RequestCommand {...props} />)

  expect(screen.getByRole('alert', { name: 'Safe network unavailable' }).textContent).toBe(
    'This Safe is not configured on Ethereum (chain 1).'
  )
  expect(screen.queryByText(/verified confirmations/)).toBeNull()
  expect(screen.queryByText('No available owner signer')).toBeNull()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Safe unavailable' }).disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Decline' }).disabled).toBe(false)
})

it('selects a projected Safe owner and sends its ID without replacing the Safe request account', async () => {
  const req: RequestCommandRequest = {
    type: 'sign',
    handlerId: 'safe-request',
    account: `0x${'a'.repeat(40)}`,
    signingCapability: {
      type: 'safe',
      status: 'ready',
      chainId: 1,
      configured: true,
      threshold: 2,
      coordination: 'service',
      candidates: [safeOwner(1), safeOwner(2)]
    },
    safeMessageProgress: {
      status: 'collecting',
      messageHash: `0x${'b'.repeat(64)}`,
      threshold: 2,
      confirmations: []
    }
  }
  const { user } = render(<RequestCommand {...createProps(false, req, false)} />)

  expect(screen.getByText('0 / 2 verified confirmations')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Choose an owner' }).hasAttribute('disabled')).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Owner signer' }))
  await user.click(screen.getByRole('option', { name: /Owner 2/ }))
  await user.click(screen.getByRole('button', { name: 'Sign as owner' }))

  expect(capabilities.review.approve).toHaveBeenCalledWith({
    requestId: req.handlerId,
    ownerId: 'owner-2'
  })
  expect(req.account).toBe(`0x${'a'.repeat(40)}`)
})

it('shows verified Safe progress and permits another projected owner while the RPC stays pending', async () => {
  const first = safeOwner(1)
  const second = safeOwner(2)
  const req: RequestCommandRequest = {
    type: 'signTypedData',
    handlerId: 'safe-request',
    account: `0x${'a'.repeat(40)}`,
    status: 'pending',
    notice: 'See signer',
    signingCapability: {
      type: 'safe',
      status: 'ready',
      chainId: 1,
      configured: true,
      threshold: 2,
      coordination: 'service',
      candidates: [first, second]
    },
    safeMessageProgress: {
      status: 'collecting',
      messageHash: `0x${'b'.repeat(64)}`,
      threshold: 2,
      confirmations: [first.address]
    }
  }
  const { user } = render(<RequestCommand {...createProps(false, req, false)} />)

  expect(screen.getByText('1 / 2 verified confirmations')).toBeTruthy()
  expect(screen.queryByText('Waiting for signer')).toBeNull()
  expect(screen.getByRole('button', { name: 'Owner signer' }).textContent).toContain('Owner 2')
  await user.click(screen.getByRole('button', { name: 'Sign as owner' }))
  expect(capabilities.review.approve).toHaveBeenCalledWith({
    requestId: req.handlerId,
    ownerId: second.accountId
  })
})

it('shows a retryable Safe publication failure', async () => {
  const owner = safeOwner(1)
  const req: RequestCommandRequest = {
    type: 'sign',
    handlerId: 'safe-request',
    account: `0x${'a'.repeat(40)}`,
    signingCapability: {
      type: 'safe',
      status: 'ready',
      chainId: 1,
      configured: true,
      threshold: 2,
      coordination: 'service',
      candidates: [owner]
    },
    safeMessageProgress: {
      status: 'collecting',
      messageHash: `0x${'b'.repeat(64)}`,
      threshold: 2,
      confirmations: []
    }
  }
  const props = createProps(false, req, false)
  const { rerender, user } = render(<RequestCommand {...props} />)

  await user.click(screen.getByRole('button', { name: 'Sign as owner' }))
  rerender(
    <RequestCommand
      {...props}
      req={{
        ...req,
        safeMessageProgress: {
          status: 'failed',
          messageHash: `0x${'b'.repeat(64)}`,
          threshold: 2,
          confirmations: [owner.address],
          message: 'Safe service publication failed. Try again.'
        }
      }}
    />
  )

  expect(screen.getByRole('alert').textContent).toContain('publication failed')
  await user.click(screen.getByRole('button', { name: 'Retry publication' }))
  expect(capabilities.review.approve).toHaveBeenLastCalledWith({
    requestId: req.handlerId,
    ownerId: owner.accountId
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
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown
  })
  expect(capabilities.transaction.replace).toHaveBeenNthCalledWith(2, {
    requestId: req.handlerId,
    replacement: 'speed',
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown
  })
})

it('dismisses fee notices locally', () => {
  const req = {
    type: 'transaction',
    handlerId: 'request-1',
    automaticFeeUpdateNotice: {},
    approvals: [],
    data: { chainId: '0x1', gasLimit: '0x0', gasPrice: '0x0' }
  }
  render(<RequestCommand {...createProps(false, req)} />)

  fireEvent.click(screen.getByText('Ok'))

  expect(screen.queryByText('Fee updated')).toBeNull()
  expect(req.automaticFeeUpdateNotice).toEqual({})
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
    approvals: [],
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
