import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Text } from '@newframe/ui/text'

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
        <Text display='inline' variant='displayAmount'>{`$${dollars}`}</Text>
        <Text display='inline' tone='muted' variant='displayFraction'>{`.${cents || '00'}`}</Text>
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
        <Button
          appearance='raised'
          disabled={!canSend}
          label='Send'
          onPress={onSend}
          shape='pill'
          size='large'
          title={canSend ? 'Send' : 'No assets available'}
          width='wide'
        >
          <Icon name='send' size='small' tone='accent' />
          <Text display='inline' variant='label'>
            Send
          </Text>
        </Button>
        <Button
          appearance='raised'
          disabled={!canTrade}
          label='Trade'
          onPress={onTrade}
          shape='pill'
          size='large'
          title={canTrade ? 'Trade' : TRADE_DISABLED_CHAIN_LABEL}
          width='wide'
        >
          <Icon name='sync' size='small' tone='accent' />
          <Text display='inline' variant='label'>
            Trade
          </Text>
        </Button>
      </div>
    </div>
  )
}
