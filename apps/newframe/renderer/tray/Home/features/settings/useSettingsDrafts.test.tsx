import { afterEach, beforeEach, expect, it, jest as timers, mock } from 'bun:test'
import { act, renderHook } from '../../../../../test/support/componentSetup'

import { useSettingsDrafts } from './useSettingsDrafts'

beforeEach(() => timers.useFakeTimers())
afterEach(() => timers.useRealTimers())

it('persists the latest input value instead of a stale render value', () => {
  const persist = mock()
  const { result } = renderHook(() =>
    useSettingsDrafts({
      initialLatticeEndpoint: '',
      initialLatticeEndpointMode: 'default',
      initialPortfolioApiKeyConfigured: false,
      persist
    })
  )

  act(() => result.current.changeLatticeEndpoint(' https://relay.example '))
  act(() => timers.advanceTimersByTime(1000))

  expect(persist).toHaveBeenCalledWith({
    setting: 'lattice-endpoint',
    value: 'https://relay.example'
  })
})

it('uses an already configured API key without exposing it to the renderer draft', () => {
  const persist = mock()
  const { result } = renderHook(() =>
    useSettingsDrafts({
      initialLatticeEndpoint: '',
      initialLatticeEndpointMode: 'default',
      initialPortfolioApiKeyConfigured: true,
      persist
    })
  )

  expect(result.current.portfolioApiKey).toBe('')
  act(() => result.current.toggleAutoDiscoverTokens(false))

  expect(persist).toHaveBeenCalledWith({ setting: 'auto-discover-tokens', value: true })
  expect(result.current.portfolioApiKeyRequired).toBe(false)
})

it('requires and writes a key before enabling discovery when no key is configured', () => {
  const persist = mock()
  const { result } = renderHook(() =>
    useSettingsDrafts({
      initialLatticeEndpoint: '',
      initialLatticeEndpointMode: 'default',
      initialPortfolioApiKeyConfigured: false,
      persist
    })
  )

  act(() => result.current.toggleAutoDiscoverTokens(false))
  expect(result.current.portfolioApiKeyRequired).toBe(true)
  expect(persist).not.toHaveBeenCalled()

  act(() => result.current.changePortfolioApiKey(' new-secret '))
  act(() => result.current.toggleAutoDiscoverTokens(false))

  expect(persist).toHaveBeenCalledWith({
    setting: 'auto-discover-tokens',
    value: true,
    apiKey: 'new-secret'
  })
})
