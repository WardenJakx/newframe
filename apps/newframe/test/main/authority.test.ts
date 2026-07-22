import { describe, expect, it } from 'bun:test'

import {
  createMainPrincipal,
  createAgentPrincipal,
  createRendererPrincipal,
  createRpcPrincipal,
  decideWalletAction,
  hasPrincipalCapability
} from '../../main/authority'

import type { AccountRequest, RequestType } from '../../main/accounts/types'

function request(type: RequestType = 'transaction'): AccountRequest {
  return {
    type,
    handlerId: 'request-1',
    origin: 'renderer-controlled-origin-is-not-authority',
    account: '0x1111111111111111111111111111111111111111',
    payload: {
      id: 1,
      jsonrpc: '2.0',
      method: type === 'transaction' ? 'eth_sendTransaction' : 'eth_sign',
      params: []
    }
  }
}

describe('wallet action authority', () => {
  it('requires a principal minted by trusted transport code', () => {
    const forgedRenderer = {
      kind: 'renderer',
      role: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 1,
      windowInstanceId: 'forged'
    }

    expect(decideWalletAction(forgedRenderer, request())).toEqual({
      outcome: 'reject',
      reason: 'Untrusted request source'
    })
  })

  it('records renderer identity from the trusted principal rather than request fields', () => {
    const principal = createRendererPrincipal({
      clientType: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 42,
      windowInstanceId: 'window-42'
    })

    const decision = decideWalletAction(principal, request())

    expect(decision).toMatchObject({
      outcome: 'prompt',
      authorization: {
        decision: 'prompt',
        principal: {
          kind: 'renderer',
          role: 'sidetray',
          entrypoint: 'sidetray',
          webContentsId: 42,
          windowInstanceId: 'window-42'
        },
        intent: {
          requestType: 'transaction',
          account: '0x1111111111111111111111111111111111111111',
          method: 'eth_sendTransaction'
        }
      }
    })
    expect((decision as any).authorization.principal.origin).toBeUndefined()
  })

  it('keeps RPC origin as transport metadata and still requires a prompt', () => {
    const principal = createRpcPrincipal({
      transport: 'websocket',
      connectionId: 'socket-1',
      origin: 'app.example'
    })

    expect(decideWalletAction(principal, request())).toMatchObject({
      outcome: 'prompt',
      authorization: {
        decision: 'prompt',
        principal: {
          kind: 'rpc',
          transport: 'websocket',
          connectionId: 'socket-1',
          origin: 'app.example'
        }
      }
    })
  })

  it('accepts internal capabilities only from a branded transport principal', () => {
    const principal = createRpcPrincipal({
      transport: 'websocket',
      connectionId: 'companion-1',
      origin: 'newframe-extension',
      capabilities: ['wallet:internal-state']
    })
    const forged = {
      kind: 'rpc',
      transport: 'websocket',
      connectionId: 'forged',
      origin: 'newframe-extension',
      capabilities: ['wallet:internal-state']
    }

    expect(hasPrincipalCapability(principal, 'wallet:internal-state')).toBe(true)
    expect(hasPrincipalCapability(forged, 'wallet:internal-state')).toBe(false)
    expect(Object.isFrozen(principal.capabilities)).toBe(true)
  })

  it('rejects action types that are outside a renderer role', () => {
    const principal = createRendererPrincipal({
      clientType: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 1,
      windowInstanceId: 'side-tray'
    })

    expect(decideWalletAction(principal, request('access'))).toEqual({
      outcome: 'reject',
      reason: 'Request source is not allowed to perform this action'
    })
  })

  it('keeps main and ordinary RPC actions on the prompt path', () => {
    const principals = [
      createMainPrincipal('test'),
      createRpcPrincipal({ transport: 'http', connectionId: 'http-1', origin: 'app.example' })
    ]

    for (const principal of principals) {
      expect(decideWalletAction(principal, request()).outcome).toBe('prompt')
    }
  })

  it('allows a valid agent principal to act autonomously only for its session account', () => {
    const principal = createAgentPrincipal({
      sessionId: 'session-1',
      accountId: '0x1111111111111111111111111111111111111111',
      expiresAt: Date.now() + 60_000
    })

    expect(decideWalletAction(principal, request())).toMatchObject({
      outcome: 'autonomous',
      authorization: {
        decision: 'autonomous',
        principal: {
          kind: 'agent',
          sessionId: 'session-1',
          accountId: '0x1111111111111111111111111111111111111111'
        }
      }
    })
    expect(decideWalletAction(principal, request('sign')).outcome).toBe('autonomous')
    expect(decideWalletAction(principal, request('signTypedData')).outcome).toBe('autonomous')

    expect(
      decideWalletAction(principal, {
        ...request(),
        account: '0x2222222222222222222222222222222222222222'
      })
    ).toEqual({ outcome: 'reject', reason: 'Agent session is not authorized for this account' })
  })

  it('rejects expired agent principals and agent connection-management actions', () => {
    const principal = createAgentPrincipal({
      sessionId: 'expired',
      accountId: '0x1111111111111111111111111111111111111111',
      expiresAt: Date.now() - 1
    })

    expect(decideWalletAction(principal, request())).toEqual({
      outcome: 'reject',
      reason: 'Agent session expired'
    })
    expect(decideWalletAction(principal, request('agentAccess'))).toEqual({
      outcome: 'reject',
      reason: 'Request source is not allowed to perform this action'
    })
  })

  it('rejects malformed actions before they reach an account queue', () => {
    const malformed = { ...request(), account: '' }
    expect(decideWalletAction(createMainPrincipal('test'), malformed)).toEqual({
      outcome: 'reject',
      reason: 'Malformed wallet action'
    })
  })
})
