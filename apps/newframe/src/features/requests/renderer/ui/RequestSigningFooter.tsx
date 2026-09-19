import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import type { ClipboardCapability } from '../../../../shared/renderer/capabilities'
import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity'
import { SigningAccount } from './SigningAccount'

export function RequestSigningFooter({
  account,
  clipboard,
  children,
  label
}: {
  account: { address: string; name?: string; ensName?: string; accountType?: string }
  clipboard: ClipboardCapability
  children: ReactNode
  label?: string
}) {
  return (
    <Stack gap='small'>
      <SigningAccount label={label}>
        <AddressIdentity
          address={account.address}
          accountType={account.accountType}
          clipboard={clipboard}
          nickname={account.name ?? account.ensName ?? shortAddress(account.address)}
          showFullAddress
        />
      </SigningAccount>
      {children}
    </Stack>
  )
}
