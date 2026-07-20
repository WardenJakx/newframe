import React from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import AddressQRCode from '../../AddressQRCode'

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
    <div aria-label='Receive assets' className='t2Overlay t2ReceiveOverlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={onBack} title='Receive Assets' />
      <div className='t2ReceiveBody'>
        <div className='t2ReceiveIcon'>{icon}</div>
        <div className='t2ReceiveName'>
          <Text align='center' variant='heading'>
            {name}
          </Text>
        </div>
        <div className='t2ReceiveQr'>
          <AddressQRCode address={account.address} />
        </div>
        <Button appearance='control' label='Copy receive address' onPress={onCopy} shape='pill' width='full'>
          <Text truncate variant='code'>
            {copied ? 'Address copied' : account.address}
          </Text>
          <Icon name='copy' size='small' />
        </Button>
      </div>
    </div>
  )
}
