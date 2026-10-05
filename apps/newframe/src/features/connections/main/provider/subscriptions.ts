import { v5 as uuid } from 'uuid'

import type { TrustedCapability } from '../../../../app/main/gateway/requestSource.ts'
import type { CanonicalStoreReader } from '../../../../core/state/store/actions.ts'

export const enum SubscriptionType {
  ACCOUNTS = 'accountsChanged',
  ASSETS = 'assetsChanged',
  CHAINS = 'chainsChanged'
}

export type Subscription = {
  id: string
  originId: string
  capabilities: readonly TrustedCapability[]
  extensionId?: string
}

export function hasSubscriptionGrant(
  subType: string,
  address: string,
  subscription: Subscription,
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
) {
  if (
    [SubscriptionType.ACCOUNTS, SubscriptionType.CHAINS].includes(subType as SubscriptionType) &&
    subscription.capabilities.includes('wallet:internal-state')
  ) {
    // The authenticated extension transport is allowed to observe wallet/chain state for UI updates.
    return true
  }

  if (!address) {
    return false
  }

  const state = canonicalStore.getState()
  const grantsByAddress = state.main.permissions as Record<
    string,
    (typeof state.main.permissions)[string] | undefined
  >
  const grants = grantsByAddress[address]
  if (!grants) {
    return false
  }
  const grant = Object.values(grants).find(({ origin }) => {
    return uuid(origin, uuid.DNS) === subscription.originId
  })

  return !!grant?.provider
}
