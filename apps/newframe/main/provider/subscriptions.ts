import { v5 as uuid } from 'uuid'
import store from '../store'

import type { Permission } from '../store/state'

const trustedOriginIds = ['newframe-extension', 'newframe-internal', 'frame-extension', 'frame-internal'].map(
  (origin) => uuid(origin, uuid.DNS)
)
const isTrustedOrigin = (originId: string) => trustedOriginIds.includes(originId)

export const enum SubscriptionType {
  ACCOUNTS = 'accountsChanged',
  ASSETS = 'assetsChanged',
  CHAINS = 'chainsChanged'
}

export type Subscription = {
  id: string
  originId: string
}

export function hasSubscriptionPermission(subType: string, address: string, originId: string) {
  if (
    [SubscriptionType.ACCOUNTS, SubscriptionType.CHAINS].includes(subType as SubscriptionType) &&
    isTrustedOrigin(originId)
  ) {
    // internal trusted origins are allowed to observe wallet/chain state for companion UI updates
    return true
  }

  if (!address) {
    return false
  }

  const permissions = (store.getState().main.permissions[address] || {}) as Record<string, Permission>
  const permission = Object.values(permissions).find(({ origin }) => {
    return uuid(origin, uuid.DNS) === originId
  })

  return !!permission?.provider
}
