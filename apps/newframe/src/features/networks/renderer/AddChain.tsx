import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { AddChainDetails } from '../../../shared/renderer/ui/AddChainDetails'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import type { NetworksCapability } from './networksCapability'

export interface PendingChainRequest {
  chain?: {
    id?: string | number
    chainId?: string | number
    icon?: string
    name?: string
    nativeCurrencyName?: string
    symbol?: string
    primaryRpc?: string
    secondaryRpc?: string
    explorer?: string
  }
  homeCommandId?: number
  requestId?: string
}

export function AddChain({
  capability,
  onResolved,
  pending
}: {
  capability: Pick<NetworksCapability, 'resolveAddChain'>
  onResolved: (outcome: 'approved' | 'rejected') => void
  pending: PendingChainRequest
}) {
  const chain = pending.chain ?? {}
  const requestId = pending.requestId
  const homeCommandId = pending.homeCommandId
  const resolve = (approved: boolean) => {
    if (requestId || homeCommandId) {
      void capability.resolveAddChain({
        approved,
        ...(requestId ? { requestId } : { homeCommandId })
      })
    }
    onResolved(approved ? 'approved' : 'rejected')
  }
  return (
    <TrayOverlay
      closeLabel='Back'
      footer={
        <Stack direction='row' equal gap='xsmall' grow>
          <Button
            appearance='danger'
            label='Reject chain'
            onPress={() => resolve(false)}
            shape='pill'
            size='large'
          >
            <Text variant='action'>Reject</Text>
          </Button>
          <Button
            appearance='primary'
            label='Add chain'
            onPress={() => resolve(true)}
            shape='pill'
            size='large'
          >
            <Text tone='inverse' variant='action'>
              Add chain
            </Text>
          </Button>
        </Stack>
      }
      label='Add Chain'
      onClose={() => resolve(false)}
      title='Add Chain'
    >
      <AddChainDetails chain={chain} />
    </TrayOverlay>
  )
}
