import { describe, expect, it } from 'bun:test'

import type { AccountRequest, RequestType } from '../../../features/requests/contract/requests.ts'
import {
  createMainProcessSource,
  createAiSessionClientSource,
  createNewframeInternalSource,
  createLocalApiSource,
  authorizeGatewayOperation,
  hasSourceCapability
} from './requestSource.ts'

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
  it('requires a request source minted by trusted transport code', () => {
    const forgedRenderer = {
      kind: 'renderer',
      role: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 1,
      windowInstanceId: 'forged'
    }

    expect(authorizeGatewayOperation(forgedRenderer, request())).toEqual({
      outcome: 'reject',
      reason: 'Untrusted request source'
    })
  })

  it('records renderer identity from the trusted request source rather than request fields', () => {
    const requestSource = createNewframeInternalSource({
      clientType: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 42,
      windowInstanceId: 'window-42'
    })

    const decision = authorizeGatewayOperation(requestSource, request())

    expect(decision).toMatchObject({
      outcome: 'prompt',
      authorization: {
        decision: 'prompt',
        requestSource: {
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
    expect(decision.outcome).toBe('prompt')
    if (decision.outcome !== 'prompt') {
      throw new Error('Expected renderer request to require authorization')
    }
    expect('origin' in decision.authorization.requestSource).toBe(false)
  })

  it('keeps RPC origin as transport metadata and still requires a prompt', () => {
    const requestSource = createLocalApiSource({
      transport: 'websocket',
      connectionId: 'socket-1',
      origin: 'app.example'
    })

    expect(authorizeGatewayOperation(requestSource, request())).toMatchObject({
      outcome: 'prompt',
      authorization: {
        decision: 'prompt',
        requestSource: {
          kind: 'rpc',
          transport: 'websocket',
          connectionId: 'socket-1',
          origin: 'app.example'
        }
      }
    })
  })

  it('accepts internal capabilities only from a branded request source', () => {
    const requestSource = createLocalApiSource({
      transport: 'websocket',
      connectionId: 'extension-1',
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

    expect(hasSourceCapability(requestSource, 'wallet:internal-state')).toBe(true)
    expect(hasSourceCapability(forged, 'wallet:internal-state')).toBe(false)
    expect(Object.isFrozen(requestSource.capabilities)).toBe(true)
  })

  it('rejects action types that are outside a renderer role', () => {
    const requestSource = createNewframeInternalSource({
      clientType: 'sidetray',
      entrypoint: 'sidetray',
      webContentsId: 1,
      windowInstanceId: 'side-tray'
    })

    expect(authorizeGatewayOperation(requestSource, request('access'))).toEqual({
      outcome: 'reject',
      reason: 'Request source is not allowed to perform this action'
    })
  })

  it('keeps main and ordinary RPC actions on the prompt path', () => {
    const requestSources = [
      createMainProcessSource('test'),
      createLocalApiSource({ transport: 'http', connectionId: 'http-1', origin: 'app.example' })
    ]

    for (const requestSource of requestSources) {
      expect(authorizeGatewayOperation(requestSource, request()).outcome).toBe('prompt')
    }
  })

  it('allows a valid agent request source to act autonomously only for its session account', () => {
    let active = true
    const requestSource = createAiSessionClientSource({
      sessionId: 'session-1',
      accountId: '0x1111111111111111111111111111111111111111',
      expiresAt: Date.now() + 60_000,
      isActive: () => active
    })

    expect(authorizeGatewayOperation(requestSource, request())).toMatchObject({
      outcome: 'autonomous',
      authorization: {
        decision: 'autonomous',
        requestSource: {
          kind: 'agent',
          sessionId: 'session-1',
          accountId: '0x1111111111111111111111111111111111111111'
        }
      }
    })
    expect(authorizeGatewayOperation(requestSource, request('sign')).outcome).toBe('autonomous')
    expect(authorizeGatewayOperation(requestSource, request('signTypedData')).outcome).toBe('autonomous')

    expect(
      authorizeGatewayOperation(requestSource, {
        ...request(),
        account: '0x2222222222222222222222222222222222222222'
      })
    ).toEqual({ outcome: 'reject', reason: 'Agent session is not authorized for this account' })

    active = false
    expect(authorizeGatewayOperation(requestSource, request())).toEqual({
      outcome: 'reject',
      reason: 'Agent session is revoked or unavailable'
    })
  })

  it('rejects expired agent request sources and agent connection-management actions', () => {
    const requestSource = createAiSessionClientSource({
      sessionId: 'expired',
      accountId: '0x1111111111111111111111111111111111111111',
      expiresAt: Date.now() - 1,
      isActive: () => true
    })

    expect(authorizeGatewayOperation(requestSource, request())).toEqual({
      outcome: 'reject',
      reason: 'Agent session expired'
    })
    expect(authorizeGatewayOperation(requestSource, request('agentAccess'))).toEqual({
      outcome: 'reject',
      reason: 'Request source is not allowed to perform this action'
    })
  })

  it('rejects malformed actions before they reach an account queue', () => {
    const malformed = { ...request(), account: '' }
    expect(authorizeGatewayOperation(createMainProcessSource('test'), malformed)).toEqual({
      outcome: 'reject',
      reason: 'Malformed wallet action'
    })
  })
})
