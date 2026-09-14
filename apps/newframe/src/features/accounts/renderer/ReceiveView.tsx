import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { ClipboardCapability } from '../../../shared/renderer/capabilities'
import { AddressIdentity } from '../../../shared/renderer/ui/AddressIdentity'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import AddressQRCode from './AddressQRCode'

const receiveRecipe = cva({
  base: {
    width: '100%',
    marginInline: 'auto',
    paddingBlockEnd: '9'
  }
})

export function ReceiveView({
  account,
  clipboard,
  accountType,
  name,
  onBack
}: {
  account: { address: string }
  clipboard: ClipboardCapability
  accountType?: string
  name: string
  onBack: () => void
}) {
  return (
    <TrayOverlay
      closeLabel='Back'
      label='Receive assets'
      onClose={onBack}
      placement='center'
      title='Receive Assets'
    >
      <div className={receiveRecipe()}>
        <Stack align='center' gap='medium'>
          <Text align='center' variant='heading'>
            {name}
          </Text>
          <AddressQRCode address={account.address} />
          <AddressIdentity
            address={account.address}
            accountType={accountType}
            clipboard={clipboard}
            showFullAddress
          />
        </Stack>
      </div>
    </TrayOverlay>
  )
}
