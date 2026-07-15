import React from 'react'

import svg from '../../../../../resources/svg'
import Requests from '../../../Account/Requests'
import { activateOnKeyboard } from '../../ui/keyboard'

export function RequestsOverlayView({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  return (
    <div aria-label='Requests' className='t2Overlay cardShow' role='dialog'>
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
        <div className='t2OverlayTitle'>Requests</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2RequestsScroll'>
        {accountId ? (
          <Requests expanded account={accountId} moduleId='requests' />
        ) : (
          <div className='t2EmptyState'>No Pending Requests</div>
        )}
      </div>
    </div>
  )
}
