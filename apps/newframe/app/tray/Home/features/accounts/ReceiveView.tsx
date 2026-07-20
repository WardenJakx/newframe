import React from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import { cva } from '../../../../../resources/styled-system/css/cva.js'
import AddressQRCode from '../../AddressQRCode'

const receiveRecipe = cva({
  base: {
    width: '100%',
    marginInline: 'auto',
    paddingBlockEnd: '9'
  }
})

export function ReceiveView({
  account,
  copied,
  icon,
  name,
  onBack,
  onCopy
}: {
  account: { address: string }
  copied: boolean
  icon: React.ReactNode
  name: string
  onBack: () => void
  onCopy: () => void
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
          <Button
            appearance='control'
            label='Copy receive address'
            onPress={onCopy}
            shape='pill'
            width='full'
          >
            <Text truncate variant='code'>
              {copied ? 'Address copied' : account.address}
            </Text>
            <Icon name='copy' size='small' />
          </Button>
        </Stack>
      </div>
    </TrayOverlay>
  )
}
