import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import type { ClipboardCapability } from '../../../../shared/renderer/capabilities'
import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity'
import { SigningAccount } from './SigningAccount'

export function RequestSigningFooter({
  account,
  clipboard,
  children
}: {
  account: { address: string; name?: string; ensName?: string }
  clipboard: ClipboardCapability
  children: ReactNode
}) {
  return (
    <Stack gap='small'>
      <SigningAccount>
        <AddressIdentity
          address={account.address}
          clipboard={clipboard}
          nickname={account.name || account.ensName || shortAddress(account.address)}
          showFullAddress
        />
      </SigningAccount>
      {children}
    </Stack>
  )
}
