import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { cleanup, render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { WalletRequestSchema } from '../../../../platform/state-sync/contract/projections'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support'
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

function accessRequest() {
  return {
    type: 'access',
    handlerId: requestId,
    origin,
    account: accountId,
    payload: {
      id: 3,
      jsonrpc: '2.0',
      method: 'eth_accounts',
      params: []
    }
  } as const
}

function addChainRequest() {
  return {
    type: 'addChain',
    handlerId: requestId,
    origin,
    account: accountId,
    payload: {
      id: 4,
      jsonrpc: '2.0',
      method: 'wallet_addEthereumChain',
      params: [{ chainId: '0x1234' }]
    },
    chain: {
      id: 4660,
      type: 'ethereum',
      name: 'Bizarro Polygon',
      icon: 'https://icons.example/chain.png',
      nativeCurrencyName: 'New',
      symbol: 'NEW',
      primaryRpc: 'https://rpc.example',
      secondaryRpc: 'https://backup-rpc.example',
      explorer: 'https://explorer.example'
    }
  } as const
}

function resetWithRequest(input: unknown) {
  const request = WalletRequestSchema.parse(input)
  const state = walletState({
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
  fixture.state.reset(state)
  return state
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

  it('renders an account access request whose payload stores the origin separately', () => {
    resetWithRequest(accessRequest())
    renderAccount()

    expect(screen.getByText(origin)).toBeTruthy()
    expect(screen.getByText('wants to connect')).toBeTruthy()
  })

  it('renders add-chain identity and settings in the initial request view', () => {
    resetWithRequest(addChainRequest())
    renderAccount()

    expect(screen.getByRole('heading', { level: 2, name: 'Bizarro Polygon' })).toBeTruthy()
    expect(screen.getByText(`${origin} wants to add this chain.`)).toBeTruthy()
    expect(screen.getByText('4660 (0x1234)')).toBeTruthy()
    expect(screen.getByText('New (NEW)')).toBeTruthy()
    expect(screen.getByText('https://rpc.example')).toBeTruthy()
    expect(screen.queryByText('wants to add chain')).toBeNull()
  })
})

it.each(['eth_requestAccounts', 'personal_sign'])(
  'shows the injected account selector only for discovery prompts: %s',
  (method) => {
    resetWithRequest({
      type: 'access',
      handlerId: requestId,
      origin,
      account: accountId,
      payload: { id: 3, jsonrpc: '2.0', method, params: [] }
    })
    render(
      <RequestViewProvider>
        <Account
          capabilities={createRequestRendererCapabilitiesFake()}
          id={accountId}
          accountSelector={<button type='button'>Choose wallet</button>}
        />
      </RequestViewProvider>
    )
    expect(Boolean(screen.queryByRole('button', { name: 'Choose wallet' }))).toBe(
      method === 'eth_requestAccounts'
    )
    expect(screen.getByText(origin)).toBeTruthy()
  }
)

it('keeps message content separate from the account selector', () => {
  resetWithRequest({
    type: 'sign',
    handlerId: requestId,
    origin,
    account: accountId,
    payload: { id: 4, jsonrpc: '2.0', method: 'personal_sign', params: ['message'] },
    data: { decodedMessage: 'message' }
  })
  render(
    <RequestViewProvider>
      <Account
        capabilities={createRequestRendererCapabilitiesFake()}
        id={accountId}
        accountSelector={<button type='button'>Choose wallet</button>}
      />
    </RequestViewProvider>
  )
  expect(screen.queryByRole('button', { name: 'Choose wallet' })).toBeNull()
  expect(screen.getByLabelText('Message to sign').textContent).toBe('message')
})

it.each([accountId, accountId.toUpperCase()])(
  'resolves the signature account by ID or address independently of current selection: %s',
  (requestAccount) => {
    const decodedMessage = `example.test wants you to sign in with your Ethereum account:
${accountId}

Sign in.

URI: https://example.test/login
Version: 1
Chain ID: 1
Nonce: abcdefgh
Issued At: 2026-09-13T12:00:00Z`
    const state = resetWithRequest({
      type: 'sign',
      handlerId: requestId,
      origin,
      account: requestAccount,
      payload: { id: 4, jsonrpc: '2.0', method: 'personal_sign', params: [decodedMessage] },
      data: { decodedMessage }
    })
    const signingAccount = (state.accounts as Partial<typeof state.accounts>)[accountId]
    if (!signingAccount) {
      throw new Error('Missing fixture account')
    }
    fixture.state.reset({
      ...state,
      currentAccount: 'other-wallet',
      accounts: {
        ...state.accounts,
        'other-wallet': { ...signingAccount, id: 'other-wallet', address: spenderAddress, name: 'Other' }
      }
    })
    renderAccount()
    expect(screen.getByText(accountId)).toBeTruthy()
    expect(screen.queryByText(/differs from the signing account/)).toBeNull()
    expect(fixture.state.getState().currentAccount).toBe('other-wallet')
  }
)
