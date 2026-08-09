import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { expect, it, jest as timers, mock } from 'bun:test'

import { createAgentService } from './index'

const accountId = '0x1111111111111111111111111111111111111111'

function request() {
  return Object.assign(
    Readable.from([Buffer.from(JSON.stringify({ descriptor: { name: 'Test Agent' }, durationSeconds: 60 }))]),
    {
      headers: {},
      method: 'POST',
      url: '/agent/session'
    }
  )
}

function response() {
  return Object.assign(new EventEmitter(), {
    body: '',
    destroyed: false,
    status: 0,
    writableEnded: false,
    writeHead(status: number) {
      this.status = status
      return this
    },
    end(body = '') {
      this.body = body
      this.writableEnded = true
      return this
    }
  })
}

it('characterizes agent prompt timeout, disconnect, approval idempotency, and dispose cleanup', async () => {
  timers.useFakeTimers()
  try {
    const requests: Record<string, any> = {}
    const continuations = new Map<string, (response: RPCResponsePayload) => void>()
    const requestLifecycle = {
      bind: mock(),
      create(respond: RPCRequestCallback, requestId = crypto.randomUUID()) {
        continuations.set(requestId, respond)
        return requestId
      },
      respond(requestId: string, payload: RPCResponsePayload) {
        const respond = continuations.get(requestId)
        if (!respond) return false
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
      rejectRequest(request: any, error: EVMError) {
        requestLifecycle.respond(request.handlerId, {
          id: request.payload.id,
          jsonrpc: request.payload.jsonrpc,
          error
        })
        delete requests[request.handlerId]
      },
      resolveRequest(request: any, result: unknown) {
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
      routeRequest: (_principal: unknown, routed: any) => {
        routed.authorization = {
          actionId: `action-${routed.handlerId}`,
          decision: 'prompt',
          decidedAt: Date.now(),
          principal: {
            kind: 'rpc',
            transport: 'http',
            connectionId: routed.handlerId,
            origin: 'newframe-agent'
          },
          intent: {
            requestType: routed.type,
            account: routed.account,
            method: routed.payload.method
          }
        }
        requestLifecycle.bind(routed)
        requests[routed.handlerId] = routed
        return true
      }
    }
    const flash = {
      startAgentSession: mock(),
      stopAgentSession: mock(),
      stopAgentSessionsForAccount: mock()
    }
    const service = createAgentService(
      accounts as never,
      flash as never,
      {
        getState: () => ({ main: { appLock: { locked: false } } })
      } as never,
      requestLifecycle
    )
    const handler = service.createHttpHandler({} as never)

    const timedOut = response()
    await handler(request() as never, timedOut as never)
    const timedOutId = Object.keys(requests)[0]
    timers.advanceTimersByTime(119_999)
    expect({ pending: Boolean(requests[timedOutId]), responseEnded: timedOut.writableEnded }).toEqual({
      pending: true,
      responseEnded: false
    })
    timers.advanceTimersByTime(1)
    expect({
      body: JSON.parse(timedOut.body),
      lateApproval: service.resolveAgentAccessRequest(timedOutId, true),
      pending: Boolean(requests[timedOutId]),
      status: timedOut.status
    }).toEqual({
      body: { error: 'Agent connection request expired' },
      lateApproval: false,
      pending: false,
      status: 403
    })

    const disconnected = response()
    await handler(request() as never, disconnected as never)
    const disconnectedId = Object.keys(requests)[0]
    disconnected.emit('close')
    expect({
      body: JSON.parse(disconnected.body),
      lateApproval: service.resolveAgentAccessRequest(disconnectedId, true),
      pending: Boolean(requests[disconnectedId])
    }).toEqual({
      body: { error: 'Agent disconnected before approval' },
      lateApproval: false,
      pending: false
    })

    const approved = response()
    await handler(request() as never, approved as never)
    const approvedId = Object.keys(requests)[0]
    expect(service.resolveAgentAccessRequest(approvedId, true)).toBe(true)
    expect(service.resolveAgentAccessRequest(approvedId, true)).toBe(false)
    expect(approved.status).toBe(200)
    expect(JSON.parse(approved.body)).toMatchObject({ account: accountId })
    expect(flash.startAgentSession).toHaveBeenCalledTimes(1)

    const disposed = response()
    await handler(request() as never, disposed as never)
    const disposedId = Object.keys(requests)[0]
    service.dispose()
    expect({
      lateApproval: service.resolveAgentAccessRequest(disposedId, true),
      requestRemainsCanonical: Boolean(requests[disposedId]),
      responseEnded: disposed.writableEnded
    }).toEqual({
      lateApproval: false,
      requestRemainsCanonical: false,
      responseEnded: true
    })
  } finally {
    timers.useRealTimers()
  }
})
