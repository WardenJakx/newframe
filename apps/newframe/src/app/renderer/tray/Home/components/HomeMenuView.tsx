import { Stack } from '@newframe/ui/stack'

import { MenuItem } from '../../ui/Menu/MenuItem.tsx'
import { MenuOverlay } from '../../ui/Menu/MenuOverlay.tsx'

export function HomeMenuView({
  addressBookCount,
  instanceId,
  onClose,
  onOpenAbout,
  onOpenAddressBook,
  onOpenDapps,
  onOpenSettings,
  onOpenTokens,
  onQuit,
  tokenCount
}: {
  addressBookCount: number
  instanceId: string
  onClose: () => void
  onOpenAbout: () => void
  onOpenAddressBook: () => void
  onOpenDapps: () => void
  onOpenSettings: () => void
  onOpenTokens: () => void
  onQuit: () => void
  tokenCount: number
}) {
  return (
    <MenuOverlay closeLabel='Close menu' label='Main menu' onClose={onClose} title='Menu'>
      <Stack gap='large'>
        <Stack gap='small'>
          <MenuItem detail='Connected permissions' icon='window' label='Dapps' onPress={onOpenDapps} />
          <MenuItem
            detail={tokenCount ? `${tokenCount} custom` : 'No custom tokens'}
            icon='tokens'
            label='Custom Tokens'
            onPress={onOpenTokens}
          />
          <MenuItem
            detail={addressBookCount ? `${addressBookCount} named` : 'Name the addresses you know'}
            icon='accounts'
            label='Address book'
            onPress={onOpenAddressBook}
          />
          <MenuItem
            detail='App, shortcuts, signer defaults'
            icon='settings'
            label='Settings'
            onPress={onOpenSettings}
          />
        </Stack>
        <Stack gap='small'>
          <MenuItem detail={instanceId} icon='copy' label='App Info' onPress={onOpenAbout} />
          <MenuItem icon='close' label='Quit' onPress={onQuit} tone='danger' />
        </Stack>
      </Stack>
    </MenuOverlay>
  )
}
