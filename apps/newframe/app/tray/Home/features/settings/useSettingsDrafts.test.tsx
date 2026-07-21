import { afterEach, beforeEach, expect, it, jest as timers, mock } from 'bun:test'
import { act, renderHook } from '../../../../../test/componentSetup'

import { useSettingsDrafts } from './useSettingsDrafts'

beforeEach(() => timers.useFakeTimers())
afterEach(() => timers.useRealTimers())

it('persists the latest input value instead of a stale render value', () => {
  const persist = mock()
  const { result } = renderHook(() =>
    useSettingsDrafts({
      initialLatticeEndpoint: '',
      initialLatticeEndpointMode: 'default',
      initialPortfolioApiKey: '',
      persist
    })
  )

  act(() => result.current.changeLatticeEndpoint(' https://relay.example '))
  act(() => timers.advanceTimersByTime(1000))

  expect(persist).toHaveBeenCalledWith('lattice-endpoint', 'https://relay.example')
})
