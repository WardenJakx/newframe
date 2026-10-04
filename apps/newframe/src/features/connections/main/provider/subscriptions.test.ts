import { beforeEach, describe, expect, it } from 'bun:test'

import { v5 as uuid } from 'uuid'

import store from '../../../../core/state/store/index.ts'
import { hasSubscriptionGrant, SubscriptionType } from './subscriptions.ts'

const address = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
  store.setState((state) => {
    state.main.permissions = {}
  })
})

describe('subscription permissions', () => {
  it('allows internal wallet-state events from a transport-derived capability', () => {
    const subscription = {
      id: 'subscription-1',
      originId: 'not-a-trusted-name',
      capabilities: ['wallet:internal-state'] as const
    }

    expect(hasSubscriptionGrant(SubscriptionType.ACCOUNTS, '', subscription, store)).toBe(true)
    expect(hasSubscriptionGrant(SubscriptionType.CHAINS, '', subscription, store)).toBe(true)
    expect(hasSubscriptionGrant(SubscriptionType.ASSETS, '', subscription, store)).toBe(false)
  })

  it('does not infer trust from a reserved-looking origin ID', () => {
    const subscription = {
      id: 'subscription-2',
      originId: uuid('newframe-internal', uuid.DNS),
      capabilities: []
    }

    expect(hasSubscriptionGrant(SubscriptionType.ACCOUNTS, address, subscription, store)).toBe(false)
  })

  it('continues to allow dapp subscriptions backed by account permission', () => {
    const origin = 'https://app.example'
    const subscription = {
      id: 'subscription-3',
      originId: uuid(origin, uuid.DNS),
      capabilities: []
    }
    store.setState((state) => {
      state.main.permissions[address] = {
        grant: { origin, provider: true, handlerId: 'test-handler' }
      }
    })

    expect(hasSubscriptionGrant(SubscriptionType.ASSETS, address, subscription, store)).toBe(true)
  })
})
