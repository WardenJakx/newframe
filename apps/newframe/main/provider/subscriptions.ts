import { v5 as uuid } from 'uuid'

import type { Permission } from '../store/state'
import type { TrustedCapability } from '../authority'
import type { CanonicalStoreReader } from '../store/actions'

export const enum SubscriptionType {
  ACCOUNTS = 'accountsChanged',
  ASSETS = 'assetsChanged',
  CHAINS = 'chainsChanged'
}

export type Subscription = {
  id: string
  originId: string
  capabilities: readonly TrustedCapability[]
}

export function hasSubscriptionPermission(
  subType: string,
  address: string,
  subscription: Subscription,
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
) {
  if (
    [SubscriptionType.ACCOUNTS, SubscriptionType.CHAINS].includes(subType as SubscriptionType) &&
    subscription.capabilities.includes('wallet:internal-state')
  ) {
    // The authenticated companion transport is allowed to observe wallet/chain state for UI updates.
    return true
  }

  if (!address) {
    return false
  }

  const permissions = (canonicalStore.getState().main.permissions[address] || {}) as Record<
    string,
    Permission
  >
  const permission = Object.values(permissions).find(({ origin }) => {
    return uuid(origin, uuid.DNS) === subscription.originId
  })

  return !!permission?.provider
}
