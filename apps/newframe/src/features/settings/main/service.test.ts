import { describe, expect, it } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createSettingsService } from './service'

describe('settings service', () => {
  it('owns settings transitions through real canonical actions', () => {
    const store = createTestStore({
      main: {
        autohide: false,
        portfolioApiKey: '',
        autoDiscoverTokens: false
      }
    })
    const service = createSettingsService(store)

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
