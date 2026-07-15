import React from 'react'

import svg from '../../../../../resources/svg'
import { activateOnKeyboard } from '../../ui/keyboard'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions'

export function PortfolioHeroView({
  canSend,
  canTrade,
  displayValue,
  onRefresh,
  onSend,
  onTrade,
  refreshing
}: {
  canSend: boolean
  canTrade: boolean
  displayValue: string
  onRefresh: () => void
  onSend: () => void
  onTrade: () => void
  refreshing: boolean
}) {
  const [dollars, cents] = displayValue.split('.')
  return (
    <div className='t2Hero'>
      <div className='t2HeroValue'>
        <span className='t2HeroDollars'>{`$${dollars}`}</span>
        <span className='t2HeroCents'>{`.${cents || '00'}`}</span>
        <div
          aria-label='Refresh balances'
          className={refreshing ? 't2HeroRefresh t2HeroRefreshActive' : 't2HeroRefresh'}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRefresh()
          }}
          onKeyDown={(event) => activateOnKeyboard(event, onRefresh)}
          role='button'
          tabIndex={0}
          title='Refresh balances'
        >
          {svg.sync(18)}
        </div>
      </div>
      <div className='t2HeroActions'>
        <div
          aria-disabled={!canSend}
          aria-label='Send'
          className={canSend ? 't2HeroButton' : 't2HeroButton t2HeroButtonDisabled'}
          onClick={canSend ? onSend : undefined}
          onKeyDown={canSend ? (event) => activateOnKeyboard(event, onSend) : undefined}
          role='button'
          tabIndex={canSend ? 0 : -1}
          title={canSend ? 'Send' : 'No assets available'}
        >
          <div className='t2HeroButtonIcon'>{svg.send(14)}</div>
          <span>Send</span>
        </div>
        <div
          aria-disabled={!canTrade}
          aria-label='Trade'
          className={canTrade ? 't2HeroButton' : 't2HeroButton t2HeroButtonDisabled'}
          onClick={canTrade ? onTrade : undefined}
          onKeyDown={canTrade ? (event) => activateOnKeyboard(event, onTrade) : undefined}
          role='button'
          tabIndex={canTrade ? 0 : -1}
          title={canTrade ? 'Trade' : TRADE_DISABLED_CHAIN_LABEL}
        >
          <div className='t2HeroButtonIcon'>{svg.sync(14)}</div>
          <span>Trade</span>
        </div>
      </div>
    </div>
  )
}
