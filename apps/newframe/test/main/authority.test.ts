import { describe, expect, it } from 'bun:test'

import {
  createMainPrincipal,
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

  it('has no autonomous policy in the first milestone', () => {
    const principals = [
      createMainPrincipal('test'),
      createRpcPrincipal({ transport: 'http', connectionId: 'http-1', origin: 'app.example' })
    ]

    for (const principal of principals) {
      expect(decideWalletAction(principal, request()).outcome).toBe('prompt')
    }
  })

  it('rejects malformed actions before they reach an account queue', () => {
    const malformed = { ...request(), account: '' }
    expect(decideWalletAction(createMainPrincipal('test'), malformed)).toEqual({
      outcome: 'reject',
      reason: 'Malformed wallet action'
    })
  })
})
