import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { cleanup, render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
import { WalletRequestSchema } from '../../../../platform/state-sync/contract/projections'
import { createRequestRendererCapabilitiesFake } from '../requestCapabilities.test-support'
import { RequestViewProvider } from '../requestView'
import Account from './Account'

const fixture = registerTestRuntimeFixture()
const accountId = '0x0000000000000000000000000000000000000001'
const spenderAddress = '0x0000000000000000000000000000000000000002'
const tokenAddress = '0x0000000000000000000000000000000000000003'
const requestId = 'request-1'
const origin = 'https://example.test'

const identity = (address: string) => ({ address, ens: '', type: 'external' })

function permitRequest() {
  const message = {
    deadline: '2000000000',
    owner: accountId,
    spender: spenderAddress,
    value: '1000000',
    nonce: '7'
  }

  return {
    type: 'signErc20Permit',
    handlerId: requestId,
    origin,
    account: accountId,
    payload: {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_signTypedData_v4',
      _origin: origin,
      params: [accountId, { message: { value: message.value } }]
    },
    typedMessage: {
      data: {
        domain: { chainId: 1, verifyingContract: tokenAddress },
        message,
        primaryType: 'Permit',
        types: { Permit: [] }
      },
      version: 'V4'
    },
    permit: {
      ...message,
      chainId: 1,
      spender: identity(spenderAddress),
      verifyingContract: identity(tokenAddress)
    },
    tokenData: { decimals: 6, name: 'Test Token', symbol: 'TOK' }
  } as const
}

function permitMissing(field: 'owner' | 'chainId' | 'nonce') {
  const request = permitRequest()
  switch (field) {
    case 'owner': {
      const { owner: _owner, ...permit } = request.permit
      return { ...request, permit }
    }
    case 'chainId': {
      const { chainId: _chainId, ...permit } = request.permit
      return { ...request, permit }
    }
    case 'nonce': {
      const { nonce: _nonce, ...permit } = request.permit
      return { ...request, permit }
    }
  }
}

function transactionWithParams(params: readonly unknown[]) {
  return {
    type: 'transaction',
    handlerId: requestId,
    origin,
    account: accountId,
    payload: {
      id: 2,
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      _origin: origin,
      params
    },
    data: { chainId: '0x1', type: '0x2', gasFeesSource: 'Dapp' },
    recognizedActions: []
  } as const
}

function resetWithRequest(input: unknown) {
  const request = WalletRequestSchema.parse(input)
  fixture.state.reset(
    walletState({
      accounts: {
        [accountId]: {
          id: accountId,
          profileId: 'default-profile',
          address: accountId,
          name: 'Primary',
          lastSignerType: 'address',
          status: 'ok',
          signer: 'watch',
          requests: { [requestId]: request },
          created: '2026-01-01T00:00:00.000Z'
        }
      },
      accountOrder: [accountId],
      currentAccount: accountId,
      windows: {
        panel: {
          show: true,
          nav: [{ view: 'requestView', data: { accountId, requestId } }]
        }
      }
    })
  )
}

function renderAccount() {
  render(
    <RequestViewProvider>
      <Account capabilities={createRequestRendererCapabilitiesFake()} id={accountId} />
    </RequestViewProvider>
  )
}

function expectSafeFallback() {
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  expect(screen.queryByText('Permit to Spend TOK')).toBeNull()
  expect(screen.queryByLabelText('Request summary')).toBeNull()
}

beforeEach(() => fixture.state.reset(walletState({})))
afterEach(() => cleanup())

describe('request projection validation', () => {
  for (const field of ['owner', 'chainId', 'nonce'] as const) {
    it(`fails safely when a permit is missing ${field}`, () => {
      resetWithRequest(permitMissing(field))
      renderAccount()
      expectSafeFallback()
    })
  }

  it('fails safely when permit RPC params omit the typed message', () => {
    resetWithRequest({
      ...permitRequest(),
      payload: { ...permitRequest().payload, params: [accountId] }
    })
    renderAccount()
    expectSafeFallback()
  })

  it('fails safely when transaction RPC params are empty or malformed', () => {
    for (const params of [[], [{}]]) {
      resetWithRequest(transactionWithParams(params))
      renderAccount()
      expectSafeFallback()
      cleanup()
    }
  })

  it('renders a complete permit projection', () => {
    resetWithRequest(permitRequest())
    renderAccount()

    expect(screen.getByText('Permit to Spend TOK')).toBeTruthy()
    expect(screen.getAllByText('Token Permit').length).toBeGreaterThan(0)
  })
})
