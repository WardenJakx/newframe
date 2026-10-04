import { jest as timers } from 'bun:test'

import { render, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'

import { createTrayStateWrapper, getTrayStateFixtureForRender, type TrayStateStore } from './trayState.tsx'

type TestingLibraryRenderOptions = NonNullable<Parameters<typeof render>[1]>
type UserEventSetupOptions = NonNullable<Parameters<typeof userEvent.setup>[0]>

type ComponentRenderOptions = TestingLibraryRenderOptions &
  UserEventSetupOptions & {
    advanceTimersAfterInput?: boolean | number
    trayState?: TrayStateStore
  }

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

function setupComponent(jsx: ReactElement, opts: ComponentRenderOptions = {}) {
  const { advanceTimersAfterInput, trayState, wrapper, ...options } = opts
  let advanceTimers = options.advanceTimers
  if (!advanceTimers && advanceTimersAfterInput === true) {
    advanceTimers = runAllTimers
  } else if (!advanceTimers && typeof advanceTimersAfterInput === 'number') {
    const delay = advanceTimersAfterInput
    advanceTimers = () => advanceTimersByTime(delay)
  }

  const state = trayState ?? getTrayStateFixtureForRender()
  const TrayStateWrapper = createTrayStateWrapper(state)
  const OuterWrapper = wrapper
  const rendered = render(jsx, {
    ...options,
    wrapper: ({ children }) => (
      <TrayStateWrapper>{OuterWrapper ? <OuterWrapper>{children}</OuterWrapper> : children}</TrayStateWrapper>
    )
  })

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
