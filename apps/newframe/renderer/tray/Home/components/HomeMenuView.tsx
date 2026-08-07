import { Stack } from '@newframe/ui/stack'

import { MenuItem } from '../../../shared/ui/Menu/MenuItem'
import { MenuOverlay } from '../../../shared/ui/Menu/MenuOverlay'

export function HomeMenuView({
  instanceId,
  onClose,
  onOpenAbout,
  onOpenDapps,
  onOpenSettings,
  onOpenTokens,
  onQuit,
  tokenCount
}: {
  instanceId: string
  onClose: () => void
  onOpenAbout: () => void
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
