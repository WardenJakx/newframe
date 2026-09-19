import { afterEach, beforeEach, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { createRendererStateFixture } from '../../../../../test/support/rendererState'
import { createRequestRendererCapabilitiesFake as createRequestPortsFake } from '../../../../features/requests/renderer/requestCapabilities.test-support'
import { RequestViewProvider } from '../../../../features/requests/renderer/requestView'
import { Footer } from './index'

const requestPorts = createRequestPortsFake()
const notify = mock()

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    Object.defineProperty(target, 'clientHeight', { configurable: true, value: 72 })
    this.callback([], this)
  }

  disconnect = mock()
  unobserve = mock()
}

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
  document.documentElement.style.removeProperty('--tray-footer-height')
})

it('publishes its measured height through renderer-local CSS', () => {
  render(
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={{ crumb: {} }}
      step='confirm'
    />
  )

  expect(document.documentElement.style.getPropertyValue('--tray-footer-height')).toBe('72px')
})

const requestState = (req: { handlerId: string; type: string }) => ({
  crumb: {
    view: 'requestView',
    data: { accountId: '0x1111111111111111111111111111111111111111', requestId: req.handlerId }
  },
  req
})

it('resolves access requests through the typed command using only the request ID', async () => {
  const req = { handlerId: 'access-1', type: 'access' }
  const { user } = render(
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={requestState(req)}
      step='confirm'
    />
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
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={requestState(req)}
      step='confirm'
    />
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
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={requestState(req)}
      step='confirm'
    />
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

it('resolves add-chain requests directly through their canonical request ID', async () => {
  const req = { handlerId: 'chain-1', type: 'addChain' }
  const { user } = render(
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={requestState(req)}
      step='confirm'
    />
  )

  await user.click(screen.getByText('Add chain'))
  await user.click(screen.getByText('Decline'))

  expect(requestPorts.review.resolveAddChain.mock.calls).toEqual([
    [{ requestId: req.handlerId, approved: true }],
    [{ requestId: req.handlerId, approved: false }]
  ])
})

it('uses the renderer-local request step for confirm-only commands', () => {
  const req = { handlerId: 'transaction-1', type: 'transaction' }

  render(
    <Footer
      onContinue={mock()}
      capabilities={requestPorts}
      notify={notify}
      shared={requestState(req)}
      step='adjustFee'
    />
  )

  expect(screen.queryByLabelText('Sign transaction')).toBeNull()
})

const signingAddress = '0x0000000000000000000000000000000000000042'
const signingState = () =>
  createRendererStateFixture({
    initialState: {
      currentAccount: 'other-wallet',
      accounts: {
        'request-wallet': {
          id: 'request-wallet',
          address: signingAddress,
          name: 'Signing wallet',
          signer: 'signer-1'
        },
        'other-wallet': {
          id: 'other-wallet',
          address: '0x0000000000000000000000000000000000000001',
          name: 'Other wallet'
        }
      },
      signers: { 'signer-1': { id: 'signer-1' } },
      appLock: { locked: false },
      mute: { explorerWarning: false },
      networks: { ethereum: {} }
    }
  })

it.each(['transaction', 'sign', 'signTypedData', 'signErc20Permit'])(
  'keeps the request account above shared signing actions for %s',
  async (type) => {
    const capabilities = createRequestPortsFake()
    const req = {
      handlerId: 'signing-1',
      type,
      account: signingAddress.toUpperCase(),
      ...(type === 'transaction' ? { approvals: [] } : {}),
      ...(type === 'transaction'
        ? {}
        : {
            signingCapability: {
              type: 'direct' as const,
              status: 'ready' as const,
              candidates: [
                {
                  accountId: 'request-wallet',
                  name: 'Signing wallet',
                  address: signingAddress,
                  created: '1',
                  signerType: 'seed',
                  signerAttached: true,
                  signerStatus: 'ok',
                  status: 'ready' as const
                }
              ]
            }
          }),
      data: { chainId: '0x1' }
    }
    const { user } = render(
      <RequestViewProvider>
        <Footer
          onContinue={mock()}
          capabilities={capabilities}
          notify={notify}
          shared={requestState(req)}
          step='confirm'
        />
      </RequestViewProvider>,
      { rendererState: signingState() }
    )
    const footer = screen.getByRole('contentinfo')
    const identity = screen.getByText('Signing with')
    const sign = screen.getByRole('button', { name: 'Sign' })
    expect(footer.contains(identity)).toBe(true)
    expect(footer.contains(sign)).toBe(true)
    expect(identity.compareDocumentPosition(sign) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Other wallet')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Copy address for Signing wallet' }))
    expect(capabilities.external.writeText).toHaveBeenCalledWith(signingAddress)
    await user.click(sign)
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    expect(capabilities.review.approve).toHaveBeenCalledWith({ requestId: req.handlerId })
    expect(capabilities.review.reject).toHaveBeenCalledWith({ requestId: req.handlerId })
  }
)

it.each(['adjustFee', 'adjustApproval', 'adjustPermit', 'viewRaw'] as const)(
  'keeps account and Continue in the footer on %s without signing',
  async (step) => {
    const capabilities = createRequestPortsFake()
    const onContinue = mock()
    const req = { handlerId: 'signing-1', type: 'signErc20Permit', account: 'request-wallet' }
    const { user } = render(
      <Footer
        onContinue={onContinue}
        capabilities={capabilities}
        notify={notify}
        shared={requestState(req)}
        step={step}
      />,
      { rendererState: signingState() }
    )
    expect(screen.getByText('Signing wallet')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(capabilities.review.approve).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    expect(capabilities.review.reject).toHaveBeenCalledWith({ requestId: req.handlerId })
  }
)
