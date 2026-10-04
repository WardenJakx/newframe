import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore.ts'
import { mergePersistedState, selectPersistedState } from '../../../platform/state-store/persistence.ts'
import { createSettingsService } from './service.ts'

describe('settings service', () => {
  it('persists the Tor preference across restart while retaining the actual connection state', () => {
    const store = createTestStore({
      main: {
        tor: { available: true, connection: 'connected' }
      }
    })
    const flush = mock()
    const service = createSettingsService(store, { flush })
    service.update({ type: 'settings.update', setting: 'tor-enabled', value: false })
    expect(store.getState().main.torEnabled).toBe(false)
    expect(store.getState().main.tor.connection).toBe('connected')
    expect(flush).toHaveBeenCalledTimes(1)
    const saved = selectPersistedState(store.getState())
    expect(saved.main.torEnabled).toBe(false)
    expect(saved.main).not.toHaveProperty('tor')
    const restarted = mergePersistedState(saved, createTestStore().getState())
    expect(restarted.main.torEnabled).toBe(false)
    expect(restarted.main.tor.connection).toBe('direct')
  })

  it('persists an available fee preference without modifying requests', () => {
    const store = createTestStore()
    store.store.setState((state) => {
      const metadata = state.main.chainsMeta.ethereum[1]
      metadata.gas.price.selected = 'slow'
      metadata.gas.price.levels.fast = '0x5'
      Reflect.deleteProperty(metadata.gas.price.levels, 'asap')
    })
    const flush = mock()
    const service = createSettingsService(store, { flush })
    const accounts = store.getState().main.accounts
    service.update({ type: 'settings.update', setting: 'gas-fee-level', chainId: 1, value: 'fast' })
    expect(store.getState().main.chainsMeta.ethereum[1].gas.price.selected).toBe('fast')
    expect(store.getState().main.accounts).toBe(accounts)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(() =>
      service.update({ type: 'settings.update', setting: 'gas-fee-level', chainId: 1, value: 'asap' })
    ).toThrow()
    expect(() =>
      service.update({ type: 'settings.update', setting: 'gas-fee-level', chainId: 99, value: 'fast' })
    ).toThrow()
    expect(flush).toHaveBeenCalledTimes(1)
  })
  it('owns settings transitions through real canonical actions', () => {
    const store = createTestStore({
      main: {
        autohide: false,
        portfolioApiKey: '',
        autoDiscoverTokens: false
      }
    })
    const service = createSettingsService(store, { flush: mock() })

    service.update({ type: 'settings.update', setting: 'autohide', value: true })
    service.update({
      type: 'settings.update',
      setting: 'auto-discover-tokens',
      provider: 'zerion',
      value: true,
      apiKey: ' portfolio-key '
    })

    expect({
      autohide: store.getState().main.autohide,
      autoDiscoverTokens: store.getState().main.autoDiscoverTokens,
      portfolioApiKey: store.getState().main.portfolioApiKey
    }).toEqual({
      autohide: true,
      autoDiscoverTokens: true,
      portfolioApiKey: 'portfolio-key'
    })
  })
})
