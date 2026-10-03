import { Button } from '@newframe/ui/button'
import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'

export interface ConnectedDappRow {
  id: string
  origin: string
}

export interface ConnectedExtensionRow {
  id: string
  /** Whether every account in the active profile is shared. */
  all: boolean
  /** Shared accounts in the active profile. */
  sharedAccounts: number
}

function extensionAccessSummary({ all, sharedAccounts }: ConnectedExtensionRow) {
  if (all) {
    return 'All accounts in this profile'
  }
  return `${sharedAccounts} ${sharedAccounts === 1 ? 'account' : 'accounts'} shared in this profile`
}

export function ConnectedDappsView({
  dapps,
  extensions,
  onBack,
  onClear,
  onClearAll,
  onManageExtension,
  onRemoveExtension
}: {
  dapps: ConnectedDappRow[]
  extensions: ConnectedExtensionRow[]
  onBack: () => void
  onClear: (originId: string) => void
  onClearAll: () => void
  onManageExtension: (extensionId: string) => void
  onRemoveExtension: (extensionId: string) => void
}) {
  const action = dapps.length ? (
    <IconButton
      appearance='control'
      icon='trash'
      label='Clear all connected websites'
      onPress={onClearAll}
      title='Clear all connected websites'
      tone='danger'
    />
  ) : undefined

  return (
    <TrayOverlay action={action} closeLabel='Back' label='Dapps' onClose={onBack} title='Dapps'>
      <Stack gap='small'>
        {extensions.length ? (
          <Stack gap='xsmall'>
            <Text tone='secondary' variant='overline'>
              Browser extension
            </Text>
            {extensions.map((extension) => (
              <Surface key={extension.id} padding='small' radius='card'>
                <Stack align='center' direction='row' gap='small' justify='between'>
                  <Stack gap='none' grow>
                    <Text truncate variant='body'>
                      Newframe Companion
                    </Text>
                    <Text tone='muted' truncate variant='microCode'>
                      {extension.id}
                    </Text>
                    <Text tone='muted' variant='caption'>
                      {extensionAccessSummary(extension)}
                    </Text>
                  </Stack>
                  <Button
                    appearance='control'
                    label='Manage extension accounts'
                    onPress={() => onManageExtension(extension.id)}
                    size='small'
                  >
                    <Text variant='caption'>Manage</Text>
                  </Button>
                  <IconButton
                    appearance='control'
                    icon='trash'
                    label='Remove extension'
                    onPress={() => onRemoveExtension(extension.id)}
                    size='small'
                    title='Remove extension'
                    tone='danger'
                  />
                </Stack>
              </Surface>
            ))}
            <Text tone='secondary' variant='overline'>
              Websites
            </Text>
          </Stack>
        ) : null}
        {dapps.length === 0 ? (
          <Text align='center' tone='disabled' variant='label'>
            No Connected Websites
          </Text>
        ) : (
          dapps.map((dapp) => (
            <Surface key={dapp.id} padding='small' radius='card'>
              <Stack align='center' direction='row' gap='small' justify='between'>
                <Text truncate variant='body'>
                  {dapp.origin}
                </Text>
                <IconButton
                  appearance='control'
                  icon='trash'
                  label={`Clear ${dapp.origin}`}
                  onPress={() => onClear(dapp.id)}
                  size='small'
                  title={`Clear ${dapp.origin}`}
                  tone='danger'
                />
              </Stack>
            </Surface>
          ))
        )}
      </Stack>
    </TrayOverlay>
  )
}
