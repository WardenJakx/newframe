import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  getProfileAccountIds
} from '../../../app/contracts/state/main.ts'
import { builtInChainIconUrl } from '../../../features/chains/domain/chain/index.ts'
import createInitialState, { CanonicalStateSchema } from './index.ts'

describe('canonical state defaults', () => {
  it('creates state that satisfies the canonical runtime schema', () => {
    const first = createInitialState()
    const second = createInitialState()
    first.main.chains.ethereum[1].name = 'Changed'

    expect(CanonicalStateSchema.safeParse(first).success).toBe(true)
    expect(second.main.chains.ethereum[1].name).toBe('Mainnet')
  })

  it('starts with safe wallet preferences and one selected-account fact', () => {
    const state = createInitialState()

    expect(state.main.autoDiscoverTokens).toBe(false)
    expect(state.main.portfolioApiKey).toBe('')
    expect(state.main.showTestnets).toBe(false)
    expect(state.main.appLock).toEqual({ locked: false, vaultExists: false })
    expect(state.main.currentAccount).toBe('')
    expect(state.operations).toEqual({})
    expect({
      profiles: state.main.profiles,
      profileOrder: state.main.profileOrder,
      currentProfile: state.main.currentProfile,
      profileAccounts: getProfileAccountIds(state.main, DEFAULT_PROFILE_ID)
    }).toEqual({
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
      },
      profileOrder: [DEFAULT_PROFILE_ID],
      currentProfile: DEFAULT_PROFILE_ID,
      profileAccounts: []
    })
    expect('current' in state.selected).toBe(false)
    expect(Object.keys(state.selected).sort()).toEqual(['minimized', 'open'])
    expect(state).not.toHaveProperty('panel')
    expect(state).not.toHaveProperty('balances')
    expect(state.windows).not.toHaveProperty('frames')
    expect(state.main).not.toHaveProperty('dapp')
    expect(state.main).not.toHaveProperty('_version')
    expect(state.main).not.toHaveProperty('colorway')
  })

  it('enables only the supported production chains by default', () => {
    const state = createInitialState()
    const chains = state.main.chains.ethereum
    const enabledChainIds = Object.values(chains)
      .filter((chain) => chain.on)
      .map((chain) => chain.id)
      .sort((left, right) => left - right)

    expect(enabledChainIds).toEqual([1, 10, 56, 137, 143, 999, 8453, 9745, 42161, 43114, 81457])
    expect(chains[56].connection.primary.custom).toBe('https://bsc-dataseed.bnbchain.org')
    expect(chains[999].connection.primary.custom).toBe('https://rpc.hyperliquid.xyz/evm')
    expect(chains[143].connection.primary.custom).toBe('https://rpc.monad.xyz')
    expect(chains[9745].connection.primary.custom).toBe('https://rpc.plasma.to')
    expect(chains[81457].connection.primary.custom).toBe('https://rpc.blast.io')
    expect(chains[43114].connection.primary.custom).toBe('https://api.avax.network/ext/bc/C/rpc')
    expect(chains[1].connection.primary.current).toBe('chainlist')
    expect(chains[137].connection.primary.current).toBe('chainlist')
    expect(chains[10].connection.primary.on).toBe(true)
    expect(chains[100].on).toBe(false)
    enabledChainIds.forEach((chainId) => {
      expect(state.main.chainsMeta.ethereum[chainId].icon).toBe(builtInChainIconUrl(chainId))
      expect(state.main.chainsMeta.ethereum[chainId].nativeCurrency.icon.startsWith('https://')).toBe(true)
    })
  })
})
