import { EventEmitter } from 'events'
import { afterEach, beforeEach, expect, it, jest as timers, mock } from 'bun:test'

import store from '../../../state-store'
import TrezorSignerAdapter from './adapter'

class BridgeFake extends EventEmitter {
  open = mock()
  close = mock()
  getFeatures = mock()
}

let adapter: TrezorSignerAdapter
let bridge: BridgeFake

beforeEach(() => {
  timers.useFakeTimers()
  bridge = new BridgeFake()
  adapter = new TrezorSignerAdapter(store, bridge as never)
})

afterEach(() => {
  adapter.close()
  timers.useRealTimers()
})

it('cancels pending signer initialization when closed', () => {
  const updates = mock()
  let signer: { status: string } | undefined
  adapter.on('update', updates)
  adapter.on('add', (added) => {
    signer = added
  })
  adapter.open()

  bridge.emit('trezor:detected', 'closing-trezor-path')
  adapter.close()
  adapter.close()
  timers.advanceTimersByTime(10_000)

  expect({
    bridgeCloseCalls: bridge.close.mock.calls.length,
    pendingInitializations: (adapter as never as { initializationTimeouts: Map<string, unknown> })
      .initializationTimeouts.size,
    signerStatus: signer?.status,
    updates: updates.mock.calls
  }).toEqual({
    bridgeCloseCalls: 1,
    pendingInitializations: 0,
    signerStatus: 'Connecting',
    updates: []
  })
})
