import userEvent from '@testing-library/user-event'
import { render, act } from '@testing-library/react'

const advanceTimersByTime = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

const runAllTimers = async () => {
  await act(async () => {
    jest.runAllTimers()
  })
}

async function actAndWait(fn: any, ms = 0) {
  await fn()
  act(() => jest.advanceTimersByTime(ms))
}

function setupComponent(jsx: any, opts: any = {}) {
  const { advanceTimersAfterInput = false, ...options } = opts
  const advanceTimers =
    options.advanceTimers ||
    (advanceTimersAfterInput === true
      ? runAllTimers
      : () => advanceTimersByTime(advanceTimersAfterInput || 0))

  render(jsx)

  return {
    user: userEvent.setup({
      ...options,
      advanceTimers
    })
  }
}

export * from '@testing-library/react'

export { actAndWait, setupComponent as render }
