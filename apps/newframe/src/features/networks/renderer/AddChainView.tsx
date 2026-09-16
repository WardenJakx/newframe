import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { AddChainDetails, type AddChainDetailsModel } from '../../../shared/renderer/ui/AddChainDetails'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'

export type AddChainViewModel = AddChainDetailsModel

export function AddChainView({
  chain,
  onApprove,
  onReject
}: {
  chain: AddChainViewModel
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <TrayOverlay
      closeLabel='Back'
      footer={
        <Stack direction='row' equal gap='xsmall' grow>
          <Button appearance='danger' label='Reject chain' onPress={onReject} shape='pill' size='large'>
            <Text variant='action'>Reject</Text>
          </Button>
          <Button appearance='primary' label='Add chain' onPress={onApprove} shape='pill' size='large'>
            <Text tone='inverse' variant='action'>
              Add chain
            </Text>
          </Button>
        </Stack>
      }
      label='Add Chain'
      onClose={onReject}
      title='Add Chain'
    >
      <AddChainDetails chain={chain} />
    </TrayOverlay>
  )
}
