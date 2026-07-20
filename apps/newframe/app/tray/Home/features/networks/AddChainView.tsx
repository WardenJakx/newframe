import React from 'react'

import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'

export function AddChainView({
  onApprove,
  onReject,
  rows
}: {
  onApprove: () => void
  onReject: () => void
  rows: Array<[string, React.ReactNode]>
}) {
  return (
    <TrayOverlay closeLabel='Back' label='Add Chain' onClose={onReject} title='Add Chain'>
      <Stack gap='small'>
        {rows.map(([label, value]) => (
          <Surface key={label} padding='small' radius='card'>
            <Stack gap='xsmall'>
              <Text tone='muted' variant='supporting'>
                {label}
              </Text>
              <Text align='end' variant='supporting'>
                {value}
              </Text>
            </Stack>
          </Surface>
        ))}
        <Stack direction='row' gap='xsmall' justify='end'>
          <Button appearance='ghost' label='Reject chain' onPress={onReject} shape='pill' size='small'>
            <Text variant='compactAction'>Reject</Text>
          </Button>
          <Button appearance='primary' label='Add chain' onPress={onApprove} shape='pill' size='small'>
            <Text variant='compactAction'>Add</Text>
          </Button>
        </Stack>
      </Stack>
    </TrayOverlay>
  )
}
