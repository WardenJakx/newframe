import { jest as timers } from 'bun:test'

import { render, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'

import type { RendererStateStore } from '../../src/platform/state-sync/renderer/rendererStore'
import { createRendererStateWrapper, getRendererStateFixtureForRender } from './rendererState'

type TestingLibraryRenderOptions = NonNullable<Parameters<typeof render>[1]>
type UserEventSetupOptions = NonNullable<Parameters<typeof userEvent.setup>[0]>

type ComponentRenderOptions = TestingLibraryRenderOptions &
  UserEventSetupOptions & {
    advanceTimersAfterInput?: boolean | number
    rendererState?: RendererStateStore
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
  const { advanceTimersAfterInput, rendererState, wrapper, ...options } = opts
  let advanceTimers = options.advanceTimers
  if (!advanceTimers && advanceTimersAfterInput === true) {
    advanceTimers = runAllTimers
  } else if (!advanceTimers && typeof advanceTimersAfterInput === 'number') {
    const delay = advanceTimersAfterInput
    advanceTimers = () => advanceTimersByTime(delay)
  }

  const state = rendererState ?? getRendererStateFixtureForRender()
  const RendererStateWrapper = createRendererStateWrapper(state)
  const OuterWrapper = wrapper
  const rendered = render(jsx, {
    ...options,
    wrapper: ({ children }) => (
      <RendererStateWrapper>
        {OuterWrapper ? <OuterWrapper>{children}</OuterWrapper> : children}
      </RendererStateWrapper>
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
