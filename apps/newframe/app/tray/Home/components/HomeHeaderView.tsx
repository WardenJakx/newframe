import { IconButton } from '@newframe/ui/icon-button'
import type { IconName } from '@newframe/ui/icon'

import { HeaderBar } from '../../../../resources/Components/HeaderBar'
import { IdentityControl } from '../../../../resources/Components/IdentityControl'

export function HomeHeaderView({
  account,
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
  const address = account?.address
    ? `${account.address.substring(0, 5)}…${account.address.substring(account.address.length - 4)}`
    : ''

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
