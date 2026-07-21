import { beforeEach, describe, expect, it } from 'bun:test'

import { v5 as uuid } from 'uuid'

import store from '../../../main/store'
import { hasSubscriptionPermission, SubscriptionType } from '../../../main/provider/subscriptions'

const address = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
  store.setState((state: any) => {
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

    expect(hasSubscriptionPermission(SubscriptionType.ACCOUNTS, '', subscription)).toBe(true)
    expect(hasSubscriptionPermission(SubscriptionType.CHAINS, '', subscription)).toBe(true)
    expect(hasSubscriptionPermission(SubscriptionType.ASSETS, '', subscription)).toBe(false)
  })

  it('does not infer trust from a reserved-looking origin ID', () => {
    const subscription = {
      id: 'subscription-2',
      originId: uuid('newframe-internal', uuid.DNS),
      capabilities: []
    }

    expect(hasSubscriptionPermission(SubscriptionType.ACCOUNTS, address, subscription)).toBe(false)
  })

  it('continues to allow dapp subscriptions backed by account permission', () => {
    const origin = 'https://app.example'
    const subscription = {
      id: 'subscription-3',
      originId: uuid(origin, uuid.DNS),
      capabilities: []
    }
    store.setState((state: any) => {
      state.main.permissions[address] = {
        permission: { origin, provider: true }
      }
    })

    expect(hasSubscriptionPermission(SubscriptionType.ASSETS, address, subscription)).toBe(true)
  })
})
