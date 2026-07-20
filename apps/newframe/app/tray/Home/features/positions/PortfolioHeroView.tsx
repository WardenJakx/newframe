import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../resources/styled-system/css/cva.js'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions'

const heroRecipe = cva({
  base: { width: '100%', paddingBlockStart: '6', paddingBlockEnd: '10' }
})

const valueRecipe = cva({
  base: {
    display: 'grid',
    gridTemplateColumns: 'token(sizes.icon-button-medium) auto token(sizes.icon-button-medium)',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: '6',
    _hover: { '& [data-portfolio-refresh]': { opacity: 'full', pointerEvents: 'auto' } },
    _focusWithin: { '& [data-portfolio-refresh]': { opacity: 'full', pointerEvents: 'auto' } }
  }
})

const valueSpacerRecipe = cva({
  base: { width: 'icon-button-medium', height: 'icon-button-medium', pointerEvents: 'none' }
})

const refreshRecipe = cva({
  base: {
    display: 'inline-flex',
    opacity: 0,
    pointerEvents: 'none',
    transitionDuration: 'fast',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'standard'
  }
})

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
    <section aria-label='Portfolio summary' className={heroRecipe()}>
      <Stack align='center' gap='medium'>
        <div aria-label='Portfolio value' className={valueRecipe()} role='group'>
          <span aria-hidden='true' className={valueSpacerRecipe()} />
          <span>
            <Text display='inline' variant='displayAmount'>{`$${dollars}`}</Text>
            <Text display='inline' tone='muted' variant='displayFraction'>{`.${cents || '00'}`}</Text>
          </span>
          <span className={refreshRecipe()} data-portfolio-refresh>
            <IconButton
              appearance='control'
              disabled={refreshing}
              icon='sync'
              label='Refresh balances'
              onPress={onRefresh}
              title='Refresh balances'
            />
          </span>
        </div>
        <Stack direction='row' gap='small' justify='center'>
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
        </Stack>
      </Stack>
    </section>
  )
}
