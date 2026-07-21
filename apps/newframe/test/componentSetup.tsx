import { jest as timers } from 'bun:test'

import userEvent from '@testing-library/user-event'
import { render, act } from '@testing-library/react'

const advanceTimersByTime = async (ms = 0) => {
  await act(async () => {
    timers.advanceTimersByTime(ms)
  })
}

const runAllTimers = async () => {
  await act(async () => {
    timers.runAllTimers()
  })
}

async function actAndWait(fn: any, ms = 0) {
  await fn()
  act(() => timers.advanceTimersByTime(ms))
}

function setupComponent(jsx: any, opts: any = {}) {
  const { advanceTimersAfterInput, ...options } = opts
  const advanceTimers =
    options.advanceTimers ||
    (advanceTimersAfterInput === true
      ? runAllTimers
      : advanceTimersAfterInput !== undefined && advanceTimersAfterInput !== false
        ? () => advanceTimersByTime(advanceTimersAfterInput)
        : undefined)

  render(jsx)

  return {
    user: userEvent.setup({
      ...options,
      ...(advanceTimers ? { advanceTimers } : {})
    })
  }
}

export * from '@testing-library/react'

export { actAndWait, setupComponent as render }
