import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createSettingsService } from './service'

describe('settings service', () => {
  it('persists an available fee preference without modifying requests', () => {
    const store = createTestStore({
      main: {
        accounts: { account: { requests: { request: { data: { gasPrice: '0x1' } } } } },
        networks: { ethereum: { 1: { id: 1 } } },
        networksMeta: { ethereum: { 1: { gas: { price: { selected: 'slow', levels: { fast: '0x5' } } } } } }
      }
    })
    const flush = mock()
    const service = createSettingsService(store, { flush })
    const accounts = store.getState().main.accounts
    service.update({ type: 'settings.update', setting: 'gas-fee-level', chainId: 1, value: 'fast' })
    expect(store.getState().main.networksMeta.ethereum[1].gas.price.selected).toBe('fast')
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
