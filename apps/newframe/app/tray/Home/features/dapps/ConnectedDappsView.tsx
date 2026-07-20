import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'

export interface ConnectedDappRow {
  id: string
  origin: string
}

export function ConnectedDappsView({
  dapps,
  onBack,
  onClear,
  onClearAll
}: {
  dapps: ConnectedDappRow[]
  onBack: () => void
  onClear: (originId: string) => void
  onClearAll: () => void
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
