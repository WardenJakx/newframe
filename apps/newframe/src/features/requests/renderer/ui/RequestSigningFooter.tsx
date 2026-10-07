import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import type { ClipboardCapability } from '../../../../shared/renderer/capabilities.ts'
import { AddressIdentity } from '../../../../shared/renderer/ui/AddressIdentity.tsx'
import { SigningAccount } from './SigningAccount.tsx'

export function RequestSigningFooter({
  address,
  clipboard,
  children,
  label
}: {
  address: string
  clipboard: ClipboardCapability
  children: ReactNode
  label?: string
}) {
  return (
    <Stack gap='small'>
      <SigningAccount label={label}>
        <AddressIdentity address={address} clipboard={clipboard} />
      </SigningAccount>
      {children}
    </Stack>
  )
}
