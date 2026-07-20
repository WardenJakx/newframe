import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import link from '../../../resources/link'
import { useWalletSelector } from '../../state/useAppSelector'
import type { TrayRendererState } from '../state'

const EMPTY_BADGE = {}
const selectBadge = (state: TrayRendererState) => state.view.badge || EMPTY_BADGE

export default function Badge() {
  const badge = useWalletSelector(selectBadge) as { type?: string; version?: string }

  if (badge.type !== 'updateReady' && badge.type !== 'updateAvailable') return null

  const ready = badge.type === 'updateReady'
  return (
    <Dialog label='Newframe update' padding='large' placement='top' width='compact'>
      <Stack gap='large'>
        <Text align='center' variant='heading'>
          {ready ? 'Update Ready' : 'Update Available'}
        </Text>
        <Text align='center' tone='secondary'>
          {ready
            ? 'Restart Newframe to switch to the downloaded update.'
            : `Version ${badge.version || ''} is available. Would you like to install it?`}
        </Text>
        <Button
          appearance='primary'
          onPress={() =>
            void link.executeCommand({
              type: 'updater.respond',
              action: ready ? 'restart' : 'install'
            })
          }
          shape='pill'
          width='full'
        >
          <Text variant='action'>{ready ? 'Restart Now' : 'Install Update'}</Text>
        </Button>
        <Button
          appearance='danger'
          onPress={() =>
            void link.executeCommand({
              type: 'updater.respond',
              action: ready ? 'dismiss-ready' : 'later'
            })
          }
          shape='pill'
          width='full'
        >
          <Text variant='action'>{ready ? 'Restart Later' : 'Remind Me Later'}</Text>
        </Button>
        {!ready ? (
          <Button
            appearance='ghost'
            onPress={() => void link.executeCommand({ type: 'updater.respond', action: 'skip' })}
            shape='pill'
            width='full'
          >
            <Text variant='compactAction'>Skip This Version</Text>
          </Button>
        ) : null}
      </Stack>
    </Dialog>
  )
}
