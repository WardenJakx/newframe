import { describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'

import { observeResponseClose, PendingConnectionLimiter } from '../../../main/agent/connectionLifecycle'

describe('agent connection lifecycle', () => {
  it('reserves capacity before request bodies complete', () => {
    let pending = 0
    const limiter = new PendingConnectionLimiter(2, () => pending)

    expect(limiter.tryReserve()).toBe(true)
    expect(limiter.tryReserve()).toBe(true)
    expect(limiter.tryReserve()).toBe(false)

    limiter.release()
    pending += 1
    expect(limiter.hasCapacity()).toBe(false)

    limiter.release()
    expect(limiter.hasCapacity()).toBe(true)
  })

  it('cleans up a pending approval when its response disconnects', () => {
    const response = new EventEmitter()
    const disconnect = mock()
    let pending = true

    observeResponseClose(response, () => pending, disconnect)
    response.emit('close')
    expect(disconnect).toHaveBeenCalledTimes(1)

    const completedResponse = new EventEmitter()
    const completedDisconnect = mock()
    pending = false
    observeResponseClose(completedResponse, () => pending, completedDisconnect)
    completedResponse.emit('close')
    expect(completedDisconnect).not.toHaveBeenCalled()
  })
})
