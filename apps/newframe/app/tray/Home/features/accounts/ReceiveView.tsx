import React from 'react'

import svg from '../../../../../resources/svg'
import AddressQRCode from '../../AddressQRCode'
import { activateOnKeyboard } from '../../ui/keyboard'

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
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Receive Assets</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2ReceiveBody'>
        <div className='t2ReceiveIcon'>{icon}</div>
        <div className='t2ReceiveName'>{name}</div>
        <div className='t2ReceiveQr'>
          <AddressQRCode address={account.address} />
        </div>
        <div
          aria-label='Copy receive address'
          className='t2ReceiveAddress'
          onClick={onCopy}
          onKeyDown={(event) => activateOnKeyboard(event, onCopy)}
          role='button'
          tabIndex={0}
        >
          <span className='traySpan'>{copied ? 'Address copied' : account.address}</span>
          {svg.copy(13)}
        </div>
      </div>
    </div>
  )
}
