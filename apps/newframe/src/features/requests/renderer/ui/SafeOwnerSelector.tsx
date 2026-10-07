import { Selection } from '@newframe/ui/selection'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useState } from 'react'

import { AddressIdentity } from '../../../../shared/renderer/ui/AddressIdentity.tsx'
import {
  signerIsReady,
  signerStatusText,
  signerTypeLabel
} from '../../../../shared/renderer/ui/signerPresentation.ts'
import type { SafeOwnerAccount } from '../../../accounts/domain/safe.ts'

export function SafeOwnerSelector({
  owners,
  selectedOwnerId,
  onSelectOwner,
  disabled = false,
  label = 'Signer',
  placeholder = 'Choose an account',
  emptyLabel = 'No attached signer for the Safe',
  ownerDisabled = (owner) => owner.status === 'watch-only'
}: {
  owners: Array<SafeOwnerAccount & { accountType?: string }>
  selectedOwnerId?: string
  onSelectOwner?: (accountId: string) => void
  disabled?: boolean
  label?: string
  placeholder?: string
  emptyLabel?: string
  ownerDisabled?: (owner: SafeOwnerAccount) => boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedOwner = owners.find((owner) => owner.accountId === selectedOwnerId)
  const hasSelectableOwner = owners.some((owner) => !ownerDisabled(owner))
  const ownerDescription = (owner: SafeOwnerAccount) => {
    const type = signerTypeLabel(owner.signerType)
    return signerIsReady(owner.signerStatus)
      ? type
      : `${type} · ${signerStatusText({ status: owner.signerStatus, type })}`
  }

  return (
    <Selection
      label={label}
      disabled={disabled || !hasSelectableOwner}
      menuPlacement='above'
      menuAlign='end'
      menuWidth='wide'
      triggerSize='small'
      open={open && hasSelectableOwner}
      onOpenChange={setOpen}
      selectedId={selectedOwnerId}
      onSelect={(id) => onSelectOwner?.(id)}
      placeholder={hasSelectableOwner && !selectedOwner}
      trigger={
        hasSelectableOwner && selectedOwner ? (
          <AddressIdentity
            address={selectedOwner.address}
            accountType={selectedOwner.accountType ?? selectedOwner.signerType}
            name={selectedOwner.name}
            showCopy={false}
          />
        ) : (
          <Text variant='caption' truncate={hasSelectableOwner}>
            {hasSelectableOwner ? placeholder : emptyLabel}
          </Text>
        )
      }
      items={owners.map((owner) => ({
        id: owner.accountId,
        disabled: ownerDisabled(owner),
        content: (
          <Stack gap='none' grow>
            <AddressIdentity
              address={owner.address}
              accountType={owner.accountType ?? owner.signerType}
              name={owner.name}
              showCopy={false}
            />
            <Text variant='caption' tone='secondary'>
              {ownerDescription(owner)}
            </Text>
          </Stack>
        )
      }))}
    />
  )
}
