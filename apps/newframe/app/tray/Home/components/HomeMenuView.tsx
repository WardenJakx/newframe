import { Stack } from '@newframe/ui/stack'
import { MenuItem } from '@newframe/ui/menu-item'
import { MenuOverlay } from '@newframe/ui/menu-overlay'

export function HomeMenuView({
  instanceId,
  onClose,
  onOpenAbout,
  onOpenDapps,
  onOpenRequests,
  onOpenSettings,
  onOpenTokens,
  onQuit,
  requestCount,
  tokenCount
}: {
  instanceId: string
  onClose: () => void
  onOpenAbout: () => void
  onOpenDapps: () => void
  onOpenRequests: () => void
  onOpenSettings: () => void
  onOpenTokens: () => void
  onQuit: () => void
  requestCount: number
  tokenCount: number
}) {
  return (
    <MenuOverlay closeLabel='Close menu' label='Main menu' onClose={onClose} title='Menu'>
      <Stack gap='large'>
        <Stack gap='small'>
          <MenuItem
            badge={requestCount}
            badgeActive={requestCount > 0}
            detail={requestCount ? `${requestCount} pending` : 'No pending requests'}
            icon='inbox'
            label='Requests'
            onPress={onOpenRequests}
          />
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
