import createInitialState, { CanonicalStateSchema } from '../../../../main/store/state'

describe('canonical state defaults', () => {
  it('creates state that satisfies the canonical runtime schema', () => {
    expect(CanonicalStateSchema.safeParse(createInitialState()).success).toBe(true)
  })

  it('starts with safe wallet preferences and one selected-account fact', () => {
    const state = createInitialState()

    expect(state.main.autoDiscoverTokens).toBe(false)
    expect(state.main.portfolioApiKey).toBe('')
    expect(state.main.showTestnets).toBe(false)
    expect(state.main.appLock).toEqual({ locked: false, vaultExists: false })
    expect(state.main.currentAccount).toBe('')
    expect('current' in state.selected).toBe(false)
    expect(Object.keys(state.selected).sort()).toEqual(['minimized', 'open'])
    expect(state).not.toHaveProperty('panel')
    expect(state).not.toHaveProperty('balances')
    expect(state.windows).not.toHaveProperty('frames')
    expect(state.main).not.toHaveProperty('dapp')
    expect(state.main).not.toHaveProperty('_version')
    expect(state.main).not.toHaveProperty('colorway')
  })

  it('enables only the supported production networks by default', () => {
    const networks = createInitialState().main.networks.ethereum
    const enabledChainIds = Object.values(networks)
      .filter((network) => network.on)
      .map((network) => network.id)
      .sort((left, right) => left - right)

    expect(enabledChainIds).toEqual([1, 10, 56, 137, 143, 999, 8453, 9745, 42161, 43114, 81457])
    expect(networks[56].connection.primary.custom).toBe('https://bsc-dataseed.bnbchain.org')
    expect(networks[999].connection.primary.custom).toBe('https://rpc.hyperliquid.xyz/evm')
    expect(networks[143].connection.primary.custom).toBe('https://rpc.monad.xyz')
    expect(networks[9745].connection.primary.custom).toBe('https://rpc.plasma.to')
    expect(networks[81457].connection.primary.custom).toBe('https://rpc.blast.io')
    expect(networks[43114].connection.primary.custom).toBe('https://api.avax.network/ext/bc/C/rpc')
    expect(networks[1].connection.primary.current).toBe('chainlist')
    expect(networks[137].connection.primary.current).toBe('chainlist')
    expect(networks[10].connection.primary.on).toBe(true)
    expect(networks[100].on).toBe(false)
  })
})
