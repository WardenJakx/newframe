import { afterEach, beforeEach, expect, it, jest } from 'bun:test'
import { act, renderHook } from '../../../../../test/componentSetup'

import { useSettingsDrafts } from './useSettingsDrafts'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('persists the latest input value instead of a stale render value', () => {
  const persist = jest.fn()
  const { result } = renderHook(() =>
    useSettingsDrafts({
      initialLatticeEndpoint: '',
      initialLatticeEndpointMode: 'default',
      initialPortfolioApiKey: '',
      persist
    })
  )

  act(() => result.current.changeLatticeEndpoint(' https://relay.example '))
  act(() => jest.advanceTimersByTime(1000))

  expect(persist).toHaveBeenCalledWith('lattice-endpoint', 'https://relay.example')
})
