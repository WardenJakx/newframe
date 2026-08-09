import React from 'react'

import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { AddressIdentity } from '../../../shared/renderer/ui/AddressIdentity'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import { cva } from '../../../../generated/styled-system/css/cva.js'
import AddressQRCode from './AddressQRCode'
import type { ClipboardCapability } from '../../../shared/renderer/capabilities'

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
  icon,
  name,
  onBack
}: {
  account: { address: string }
  clipboard: ClipboardCapability
  icon: React.ReactNode
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
          {icon}
          <Text align='center' variant='heading'>
            {name}
          </Text>
          <AddressQRCode address={account.address} />
          <AddressIdentity address={account.address} clipboard={clipboard} showFullAddress />
        </Stack>
      </div>
    </TrayOverlay>
  )
}
