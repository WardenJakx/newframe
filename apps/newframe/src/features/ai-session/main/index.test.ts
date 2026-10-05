import { expect, it, jest as timers, mock } from 'bun:test'
import { EventEmitter } from 'events'

import { createDesktopCaller } from '@newframe/desktop-api/router'

import { createRpcGateway } from '../../../app/main/gateway/rpc.ts'
import type {
  EVMError,
  RPCRequestCallback,
  RPCRequestPayload,
  RPCResponsePayload
} from '../../../shared/domain/rpc.ts'
import type { AccountRequest } from '../../requests/contract/requests.ts'
import { createAiSessionService } from './index.ts'

const accountId = '0x1111111111111111111111111111111111111111'

const input = { descriptor: { name: 'Test Agent' }, durationSeconds: 60 }

it('characterizes AI session prompt timeout, disconnect, approval idempotency, and dispose cleanup', async () => {
  timers.useFakeTimers()
  try {
    const requests: Record<string, AccountRequest> = {}
    let routedRequest = Promise.withResolvers<void>()
    const continuations = new Map<string, (response: RPCResponsePayload) => void>()
    const requestLifecycle = {
      bind: mock(),
      create(respond: RPCRequestCallback, requestId = crypto.randomUUID()) {
        continuations.set(requestId, respond)
        return requestId
      },
      respond(requestId: string, payload: RPCResponsePayload) {
        const respond = continuations.get(requestId)
        if (!respond) {
          return false
        }
        continuations.delete(requestId)
        respond(payload)
        return true
      }
    }
    const account = {
      id: accountId,
      address: accountId,
      agentEnabled: true,
      getRequest: (id: string) => requests[id],
      getSigner: () => ({ type: 'seed', status: 'ok' }),
      patch: mock(),
      rejectRequest(request: AccountRequest, error: EVMError) {
        requestLifecycle.respond(request.handlerId, {
          id: request.payload.id,
          jsonrpc: request.payload.jsonrpc,
          error
        })
        delete requests[request.handlerId]
      },
      resolveRequest(request: AccountRequest, result: unknown) {
        requestLifecycle.respond(request.handlerId, {
          id: request.payload.id,
          jsonrpc: request.payload.jsonrpc,
          result
        })
        delete requests[request.handlerId]
      }
    }
    const accounts = {
      current: () => account,
      get: (id: string) => (id === accountId ? { ...account, lastSignerType: 'seed' } : undefined),
      getFrameAccount: (id: string) => (id === accountId ? account : undefined),
      routeRequest: (_requestSource: unknown, routed: AccountRequest) => {
        routed.authorization = {
          actionId: `action-${routed.handlerId}`,
          decision: 'prompt',
          decidedAt: Date.now(),
          requestSource: {
            kind: 'rpc',
            transport: 'http',
            connectionId: routed.handlerId,
            origin: 'newframe-ai-session'
          },
          intent: {
            requestType: routed.type,
            account: routed.account,
            method: routed.payload.method
          }
        }
        requestLifecycle.bind(routed)
        requests[routed.handlerId] = routed
        routedRequest.resolve()
        return true
      }
    }
    const flash = {
      startAiSession: mock(),
      stopAiSession: mock(),
      stopAiSessionsForAccount: mock()
    }
    const service = createAiSessionService(
      accounts as never,
      flash as never,
      {
        getState: () => ({ main: { appLock: { locked: false } } })
      } as never,
      requestLifecycle
    )
    const connect = (response = new EventEmitter()) =>
      createDesktopCaller(
        service.createContext({ headers: {} } as never, response as never, {} as never)
      ).agent.connect(input)

    const pending = Array.from({ length: 8 }, () => connect())
    await routedRequest.promise
    expect(connect()).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    for (const id of Object.keys(requests)) {
      service.resolveAiSessionRequest(id, true)
    }
    await Promise.all(pending)
    flash.startAiSession.mockClear()
    routedRequest = Promise.withResolvers<void>()

    const browser = createDesktopCaller(
      service.createContext(
        { headers: { origin: 'https://example.com' } } as never,
        new EventEmitter() as never,
        {} as never
      )
    )
    expect(browser.agent.connect(input)).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const timedOutResponse = connect().catch((error: unknown) => error)
    await routedRequest.promise
    routedRequest = Promise.withResolvers<void>()
    const timedOutId = Object.keys(requests)[0]
    timers.advanceTimersByTime(119_999)
    expect(Boolean(requests[timedOutId])).toBe(true)
    timers.advanceTimersByTime(1)
    expect(await timedOutResponse).toMatchObject({ message: 'AI session request expired' })
    expect({
      lateApproval: service.resolveAiSessionRequest(timedOutId, true),
      pending: Boolean(requests[timedOutId])
    }).toEqual({
      lateApproval: false,
      pending: false
    })

    const disconnected = new EventEmitter()
    const disconnectedResponse = connect(disconnected).catch((error: unknown) => error)
    await routedRequest.promise
    routedRequest = Promise.withResolvers<void>()
    const disconnectedId = Object.keys(requests)[0]
    disconnected.emit('close')
    expect(await disconnectedResponse).toMatchObject({
      message: 'AI session client disconnected before approval'
    })
    expect({
      lateApproval: service.resolveAiSessionRequest(disconnectedId, true),
      pending: Boolean(requests[disconnectedId])
    }).toEqual({
      lateApproval: false,
      pending: false
    })

    const approvedResponse = connect()
    await routedRequest.promise
    routedRequest = Promise.withResolvers<void>()
    const approvedId = Object.keys(requests)[0]
    expect(service.resolveAiSessionRequest(approvedId, true)).toBe(true)
    expect(service.resolveAiSessionRequest(approvedId, true)).toBe(false)
    const credentials = await approvedResponse
    expect(credentials).toMatchObject({ account: accountId })
    expect(flash.startAiSession).toHaveBeenCalledTimes(1)

    const handleRpc = mock((_payload: RPCRequestPayload) => {})
    const caller = createDesktopCaller(
      service.createContext(
        {
          headers: {
            authorization: `Bearer ${credentials.sessionToken}`,
            'x-newframe-agent-session': credentials.sessionId
          }
        } as never,
        new EventEmitter() as never,
        {
          send: createRpcGateway({
            isLocked: () => false,
            selectedAddresses: () => [accountId],
            handle: handleRpc
          })
        }
      )
    )
    for (const [method, code] of [
      ['wallet_unknown', -32601],
      ['eth_blockNumber', 4001]
    ] as const) {
      expect(caller.rpc({ method, params: [] })).rejects.toMatchObject({ cause: { rpc: { code } } })
    }
    expect(handleRpc).not.toHaveBeenCalled()

    const disposedResponse = connect().catch((error: unknown) => error)
    await routedRequest.promise
    routedRequest = Promise.withResolvers<void>()
    const disposedId = Object.keys(requests)[0]
    service.dispose()
    expect(await disposedResponse).toMatchObject({ message: 'AI session service stopped before approval' })
    expect({
      lateApproval: service.resolveAiSessionRequest(disposedId, true),
      requestRemainsCanonical: Boolean(requests[disposedId])
    }).toEqual({
      lateApproval: false,
      requestRemainsCanonical: false
    })
  } finally {
    timers.useRealTimers()
  }
})

it.each(['safe', 'airgap'] as const)('rejects %s AI enablement and session readiness', async (kind) => {
  const account = {
    id: accountId,
    address: accountId,
    agentEnabled: false,
    lastSignerType: kind === 'safe' ? 'seed' : 'airgap',
    safe: kind === 'safe' ? {} : undefined,
    patch: (update: { agentEnabled?: boolean }) => Object.assign(account, update),
    getSigner: () => ({ type: kind === 'safe' ? 'seed' : 'airgap', status: 'ok' })
  }
  const accounts = { current: () => account, get: () => account, getFrameAccount: () => account }
  const service = createAiSessionService(
    accounts as never,
    {} as never,
    { getState: () => ({ main: { appLock: { locked: false } } }) } as never,
    {} as never
  )
  expect(service.setAiSessionsEnabled(accountId, true)).toBeFalse()
  expect(account.agentEnabled).toBeFalse()
  account.agentEnabled = true
  const caller = createDesktopCaller(
    service.createContext({ headers: {} } as never, new EventEmitter() as never, {} as never)
  )
  expect(caller.agent.connect(input)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  service.dispose()
})
