import React from 'react'

import svg from '../../../../../resources/svg'
import { activateOnKeyboard } from '../../ui/keyboard'

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
    <div aria-label='Add Chain' className='t2Overlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={onReject}
          onKeyDown={(event) => activateOnKeyboard(event, onReject)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Add Chain</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          {rows.map(([label, value]) => (
            <div className='t2InfoRow' key={label}>
              <div className='t2InfoLabel'>{label}</div>
              <div className='t2InfoValue'>{value}</div>
            </div>
          ))}
          <div className='t2SettingsConfirmActions'>
            <div
              aria-label='Reject chain'
              className='t2SettingsSmallButton'
              onClick={onReject}
              onKeyDown={(event) => activateOnKeyboard(event, onReject)}
              role='button'
              tabIndex={0}
            >
              Reject
            </div>
            <div
              aria-label='Add chain'
              className='t2SettingsSmallButton'
              onClick={onApprove}
              onKeyDown={(event) => activateOnKeyboard(event, onApprove)}
              role='button'
              tabIndex={0}
            >
              Add
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
