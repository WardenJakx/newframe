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

function setupComponent(jsx: any, opts: any = {}) {
  const { advanceTimersAfterInput, ...options } = opts
  const advanceTimers =
    options.advanceTimers ||
    (advanceTimersAfterInput === true
      ? runAllTimers
      : advanceTimersAfterInput !== undefined && advanceTimersAfterInput !== false
        ? () => advanceTimersByTime(advanceTimersAfterInput)
        : undefined)

  const rendered = render(jsx)

  return {
    ...rendered,
    user: userEvent.setup({
      ...options,
      ...(advanceTimers ? { advanceTimers } : {})
    })
  }
}

export * from '@testing-library/react'

export { setupComponent as render }
