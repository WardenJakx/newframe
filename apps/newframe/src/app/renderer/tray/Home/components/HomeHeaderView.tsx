import type { IconName } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'

import { shortAddress } from '../../../../../shared/renderer/ui/AddressIdentity.tsx'
import { HeaderBar } from '../../../../../shared/renderer/ui/HeaderBar.tsx'
import { IdentityControl } from '../../ui/IdentityControl.tsx'

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
  onReceive
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
}) {
  const address = shortAddress(account?.address)

  return (
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
      <IconButton appearance='menu' expanded={menuOpen} icon='menu' label='Main menu' onPress={onOpenMenu} />
    </HeaderBar>
  )
}
