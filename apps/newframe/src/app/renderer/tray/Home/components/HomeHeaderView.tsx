import type { IconName } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'

import type { TorStatus } from '../../../../../platform/outbound/contract/status.ts'
import { shortAddress } from '../../../../../shared/renderer/ui/AddressIdentity.tsx'
import { HeaderBar } from '../../../../../shared/renderer/ui/HeaderBar.tsx'
import { IdentityControl } from '../../ui/IdentityControl.tsx'
import { TorIndicator } from './TorIndicator.tsx'

export function HomeHeaderView({
  account,
  accountType,
  accountsOpen,
  copied,
  icon,
  menuOpen,
  name,
  onCopy,
  onOpenAccounts,
  onOpenMenu,
  onReceive,
  tor,
  onOpenSettings
}: {
  account?: { address: string }
  accountType?: string
  accountsOpen: boolean
  copied: boolean
  icon: IconName
  menuOpen: boolean
  name: string
  onCopy: () => void
  onOpenAccounts: () => void
  onOpenMenu: () => void
  onReceive: () => void
  tor: TorStatus
  onOpenSettings: () => void
}) {
  const address = shortAddress(account?.address)

  return (
    <Stack gap='none'>
      <HeaderBar>
        <IdentityControl
          actions={
            account
              ? [
                  {
                    icon: copied ? 'check' : 'copy',
                    label: 'Copy account address',
                    onPress: onCopy,
                    title: 'Copy address'
                  },
                  {
                    icon: 'qr',
                    label: 'Show account QR code',
                    onPress: onReceive,
                    title: 'Show QR code'
                  }
                ]
              : []
          }
          address={account?.address}
          accountType={accountType}
          detail={address}
          expanded={accountsOpen}
          icon={icon}
          label='Accounts'
          name={name}
          onPress={onOpenAccounts}
        />
        <IconButton
          appearance='menu'
          expanded={menuOpen}
          icon='menu'
          label='Main menu'
          onPress={onOpenMenu}
        />
      </HeaderBar>
      <Surface padding='large' tone='transparent'>
        <Stack align='end' gap='none'>
          <TorIndicator status={tor} onOpenSettings={onOpenSettings} />
        </Stack>
      </Surface>
    </Stack>
  )
}
