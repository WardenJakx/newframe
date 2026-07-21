import { afterEach, beforeEach, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../componentSetup'
import { linkMock as link } from '../../../bun.mocks'
import { Footer } from '../../../../app/tray/Footer'
import type { WalletRendererState } from '../../../../resources/state/projections'

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
  render(<Footer shared={{ crumb: {} }} step='confirm' />)

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
  const { user } = render(<Footer shared={requestState(req)} step='confirm' />)

  await user.click(screen.getByText('Approve'))
  await user.click(screen.getByText('Decline'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.access-resolve',
    requestId: req.handlerId,
    approved: true
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.access-resolve',
    requestId: req.handlerId,
    approved: false
  })
})

it('resolves switch-chain requests without sending the renderer request object', async () => {
  const req = { handlerId: 'switch-1', type: 'switchChain' }
  const { user } = render(<Footer shared={requestState(req)} step='confirm' />)

  await user.click(screen.getByText('Switch'))
  await user.click(screen.getByText('Decline'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.switch-chain-resolve',
    requestId: req.handlerId,
    approved: true
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.switch-chain-resolve',
    requestId: req.handlerId,
    approved: false
  })
})

it('opens token review and rejects token requests through typed commands', async () => {
  const req = { handlerId: 'token-1', type: 'addToken' }
  const { user } = render(<Footer shared={requestState(req)} step='confirm' />)

  await user.click(screen.getByText('Review'))
  await user.click(screen.getByText('Decline'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.add-token-review',
    requestId: req.handlerId
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.reject',
    requestId: req.handlerId
  })
})

it('opens add-chain review and rejects through canonical request IDs', async () => {
  const req = { handlerId: 'chain-1', type: 'addChain' }
  const { user } = render(<Footer shared={requestState(req)} step='confirm' />)

  await user.click(screen.getByText('Review'))
  await user.click(screen.getByText('Decline'))

  expect(link.executeCommand).toHaveBeenNthCalledWith(1, {
    type: 'request.add-chain-review',
    requestId: req.handlerId
  })
  expect(link.executeCommand).toHaveBeenNthCalledWith(2, {
    type: 'request.reject',
    requestId: req.handlerId
  })
})

it('uses the renderer-local request step for confirm-only commands', () => {
  const req = { handlerId: 'transaction-1', type: 'transaction' }

  render(<Footer shared={requestState(req)} step='adjustFee' />)

  expect(screen.queryByLabelText('Sign transaction')).toBeNull()
})
