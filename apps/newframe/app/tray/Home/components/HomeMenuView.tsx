import React from 'react'

import svg from '../../../../resources/svg'
import { activateOnKeyboard } from '../ui/keyboard'

function MenuRow({
  danger,
  detail,
  icon,
  label,
  onClick,
  right
}: {
  danger?: boolean
  detail?: string
  icon: React.ReactNode
  label: string
  onClick: () => void
  right?: React.ReactNode
}) {
  return (
    <div
      aria-label={label}
      className={danger ? 't2MenuPanelRow t2MenuPanelRowDanger' : 't2MenuPanelRow'}
      onClick={onClick}
      onKeyDown={(event) => activateOnKeyboard(event, onClick)}
      role='button'
      tabIndex={0}
    >
      <div className='t2MenuPanelRowIcon'>{icon}</div>
      <div className='t2MenuPanelRowText'>
        <div className='t2MenuPanelRowTitle'>{label}</div>
        {detail ? <div className='t2MenuPanelRowDetail'>{detail}</div> : null}
      </div>
      <div className='t2MenuPanelRowRight'>{right || svg.arrowRight(12)}</div>
    </div>
  )
}

export function HomeMenuView({
  instanceId,
  onClose,
  onOpenAbout,
  onOpenDapps,
  onOpenRequests,
  onOpenSettings,
  onOpenTokens,
  onQuit,
  requestCount,
  tokenCount
}: {
  instanceId: string
  onClose: () => void
  onOpenAbout: () => void
  onOpenDapps: () => void
  onOpenRequests: () => void
  onOpenSettings: () => void
  onOpenTokens: () => void
  onQuit: () => void
  requestCount: number
  tokenCount: number
}) {
  return (
    <div aria-label='Main menu' className='t2Overlay t2MenuPanel cardShow' role='dialog'>
      <div className='t2OverlayHeader t2MenuPanelHeader'>
        <div className='t2OverlaySpacer' />
        <div className='t2OverlayTitle'>Menu</div>
        <div
          aria-label='Close menu'
          className='t2AccountsClose'
          onClick={onClose}
          onKeyDown={(event) => activateOnKeyboard(event, onClose)}
          role='button'
          tabIndex={0}
        >
          {svg.x(13)}
        </div>
      </div>
      <div className='t2MenuPanelScroll'>
        <div className='t2MenuPanelSection'>
          <MenuRow
            detail={requestCount ? `${requestCount} pending` : 'No pending requests'}
            icon={svg.inbox(16)}
            label='Requests'
            onClick={onOpenRequests}
            right={
              <div className={requestCount ? 't2MenuBadge t2MenuBadgeActive' : 't2MenuBadge'}>
                {requestCount}
              </div>
            }
          />
          <MenuRow detail='Connected permissions' icon={svg.window(16)} label='Dapps' onClick={onOpenDapps} />
          <MenuRow
            detail={tokenCount ? `${tokenCount} custom` : 'No custom tokens'}
            icon={svg.tokens(16)}
            label='Custom Tokens'
            onClick={onOpenTokens}
          />
          <MenuRow
            detail='App, shortcuts, signer defaults'
            icon={svg.settings(16)}
            label='Settings'
            onClick={onOpenSettings}
          />
        </div>
        <div className='t2MenuPanelSection'>
          <MenuRow detail={instanceId} icon={svg.copy(16)} label='App Info' onClick={onOpenAbout} />
          <MenuRow danger icon={svg.x(15)} label='Quit' onClick={onQuit} />
        </div>
      </div>
    </div>
  )
}
