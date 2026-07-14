import store from '../../../main/store'
import { getTokenDiscoveryProvider } from '../../../main/portfolio'

describe('#getTokenDiscoveryProvider', () => {
  it('does not construct a provider when token discovery is disabled', () => {
    store.setState((state) => {
      state.main.autoDiscoverTokens = false
      state.main.portfolioApiKey = 'zk_test'
    })

    expect(getTokenDiscoveryProvider()).toEqual({
      ok: false,
      error: 'token_discovery_disabled'
    })
  })

  it('does not construct a provider without an API key', () => {
    store.setState((state) => {
      state.main.autoDiscoverTokens = true
      state.main.portfolioApiKey = ''
    })

    expect(getTokenDiscoveryProvider()).toEqual({ ok: false, error: 'missing_api_key' })
  })

  it('returns the configured provider only when discovery is enabled with a key', () => {
    store.setState((state) => {
      state.main.autoDiscoverTokens = true
      state.main.portfolioApiKey = ' zk_test '
    })

    const access = getTokenDiscoveryProvider()

    expect(access.ok).toBe(true)
    if (access.ok) expect(access.provider).toBeDefined()
  })
})
