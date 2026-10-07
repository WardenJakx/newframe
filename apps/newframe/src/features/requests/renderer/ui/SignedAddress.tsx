import type { ReactNode } from 'react'

import { useAddressName } from '../../../../shared/renderer/addressNames.tsx'
import { AddressIdentity } from '../../../../shared/renderer/ui/AddressIdentity.tsx'

// An address inside signed data stays fully visible unless the profile names it.
export function SignedAddress({ address, children }: { address: string; children: ReactNode }) {
  return useAddressName(address) ? <AddressIdentity address={address} showCopy={false} /> : children
}
