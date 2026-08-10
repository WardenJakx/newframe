import { afterEach, beforeEach, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { Footer } from './index'
import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { createRequestRendererCapabilitiesFake as createRequestPortsFake } from '../../../../features/requests/renderer/requestCapabilities.test-support'

const requestPorts = createRequestPortsFake()
const notify = mock()

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    Object.defineProperty(target, 'clientHeight', { configurable: true, value: 72 })
    this.callback([], this as unknown as ResizeObserver)
  }

  disconnect = mock()
  unobserve = mock()
}

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
  document.documentElement.style.removeProperty('--tray-footer-height')
})

it('publishes its measured height through renderer-local CSS', () => {
  render(<Footer capabilities={requestPorts} notify={notify} shared={{ crumb: {} }} step='confirm' />)

  expect(document.documentElement.style.getPropertyValue('--tray-footer-height')).toBe('72px')
})

const requestState = (req: { handlerId: string; type: string }) => ({
  account: { lastSignerType: 'seed' } as unknown as WalletRendererState['accounts'][string],
  crumb: {
    view: 'requestView',
    data: { accountId: '0x1111111111111111111111111111111111111111', requestId: req.handlerId }
  },
  req
})

it('resolves access requests through the typed command using only the request ID', async () => {
  const req = { handlerId: 'access-1', type: 'access' }
  const { user } = render(
    <Footer capabilities={requestPorts} notify={notify} shared={requestState(req)} step='confirm' />
  )

  await user.click(screen.getByText('Approve'))
  await user.click(screen.getByText('Decline'))

  expect(requestPorts.review.resolveAccess.mock.calls).toEqual([
    [{ requestId: req.handlerId, approved: true }],
    [{ requestId: req.handlerId, approved: false }]
  ])
})

it('resolves switch-chain requests without sending the renderer request object', async () => {
  const req = { handlerId: 'switch-1', type: 'switchChain' }
  const { user } = render(
    <Footer capabilities={requestPorts} notify={notify} shared={requestState(req)} step='confirm' />
  )

  await user.click(screen.getByText('Switch'))
  await user.click(screen.getByText('Decline'))

  expect(requestPorts.review.resolveSwitchChain.mock.calls).toEqual([
    [{ requestId: req.handlerId, approved: true }],
    [{ requestId: req.handlerId, approved: false }]
  ])
})

it('opens token review and rejects token requests through typed commands', async () => {
  const req = { handlerId: 'token-1', type: 'addToken' }
  const { user } = render(
    <Footer capabilities={requestPorts} notify={notify} shared={requestState(req)} step='confirm' />
  )

  await user.click(screen.getByText('Review'))
  await user.click(screen.getByText('Decline'))

  expect({
    review: requestPorts.review.reviewAddToken.mock.calls,
    reject: requestPorts.review.reject.mock.calls
  }).toEqual({
    review: [[{ requestId: req.handlerId }]],
    reject: [[{ requestId: req.handlerId }]]
  })
})

it('opens add-chain review through its canonical request ID', async () => {
  const req = { handlerId: 'chain-1', type: 'addChain' }
  const { user } = render(
    <Footer capabilities={requestPorts} notify={notify} shared={requestState(req)} step='confirm' />
  )

  await user.click(screen.getByText('Review'))

  expect(requestPorts.review.reviewAddChain.mock.calls).toEqual([[{ requestId: req.handlerId }]])
})

it('uses the renderer-local request step for confirm-only commands', () => {
  const req = { handlerId: 'transaction-1', type: 'transaction' }

  render(<Footer capabilities={requestPorts} notify={notify} shared={requestState(req)} step='adjustFee' />)

  expect(screen.queryByLabelText('Sign transaction')).toBeNull()
})
