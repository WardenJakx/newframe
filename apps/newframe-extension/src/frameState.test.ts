import { describe, expect, test } from 'bun:test'

import { frameStateStore } from './frameState'

describe('frame state store', () => {
  test('applies atomic partial updates and notifies subscribers once', () => {
    const initialState = frameStateStore.getInitialState()
    let notifications = 0
    const unsubscribe = frameStateStore.subscribe(() => notifications++)

    frameStateStore.setState({ connected: true, currentChain: '0x1' })

    expect(frameStateStore.getState()).toEqual({
      ...initialState,
      connected: true,
      currentChain: '0x1'
    })
    expect(notifications).toBe(1)

    unsubscribe()
    frameStateStore.setState(initialState, true)
  })
})
