import React from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import ChainTokenIcon from '../../../../../resources/Components/ChainTokenIcon'
import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import {
  formatUsdRate,
  isNativeCurrency,
  type DisplayedBalance
} from '../../../../../resources/domain/balance'
import { ChainIcon } from '../../components/ChainIcon'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions'

export function AssetDetailsView({
  asset,
  canSend,
  canTrade,
  networks,
  networksMeta,
  onBack,
  onSend,
  onTrade
}: {
  asset: DisplayedBalance
  canSend: boolean
  canTrade: boolean
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onBack: () => void
  onSend: () => void
  onTrade: () => void
}) {
  const chain = networks[asset.chainId] || {}
  const price = Number(asset?.usdRate?.price || 0)
  const detailRow = (label: string, value: React.ReactNode, monospace = false) => (
    <div className='t2AssetDetailRow'>
      <Text tone='muted' variant='label'>
        {label}
      </Text>
      <div className={monospace ? 't2AssetDetailValueCode' : undefined}>
        <Text align='end' truncate={!monospace} variant={monospace ? 'code' : 'label'}>
          {value}
        </Text>
      </div>
    </div>
  )

  return (
    <div aria-label='Asset details' className='t2Overlay t2AssetOverlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back to positions' onClose={onBack} title={asset.symbol} />
      <div className='t2AssetBody'>
        <div className='t2AssetHero'>
          <div className='t2AssetHeroIcon'>
            <ChainTokenIcon
              chainId={asset.chainId}
              logoURI={asset.logoURI}
              networks={networks}
              networksMeta={networksMeta}
              size='md'
              symbol={asset.symbol}
            />
          </div>
          <Stack gap='xsmall' grow>
            <Text truncate variant='heading'>
              {asset.name || asset.symbol}
            </Text>
            <Stack direction='row' gap='xsmall'>
              <Text tone='secondary' variant='supporting'>
                {asset.symbol}
              </Text>
              <Text tone='secondary' truncate variant='supporting'>
                {chain.name || `Chain ${asset.chainId}`}
              </Text>
            </Stack>
          </Stack>
        </div>
        <div className='t2AssetDetailList'>
          {detailRow('Price', price > 0 ? `$${formatUsdRate(price, 2)}` : '$0.00')}
          {detailRow('Balance', `${asset.displayBalance} ${asset.symbol}`)}
          {detailRow(
            'Chain',
            <div className='t2AssetChainValue'>
              <div className='t2AssetChainIcon'>
                <ChainIcon
                  chainId={asset.chainId}
                  imageSize={18}
                  networks={networks}
                  networksMeta={networksMeta}
                />
              </div>
              <Text truncate variant='label'>
                {chain.name || `Chain ${asset.chainId}`}
              </Text>
            </div>
          )}
          {detailRow(
            'Contract Address',
            isNativeCurrency(asset.address) ? 'Native asset' : asset.address,
            !isNativeCurrency(asset.address)
          )}
        </div>
      </div>
      <div className='t2AssetFooter'>
        <Stack direction='row' gap='small'>
          <Button
            appearance='primary'
            disabled={!canSend}
            label={`Send ${asset.symbol}`}
            onPress={onSend}
            shape='pill'
            size='large'
            width='wide'
          >
            <Icon name='send' size='small' />
            <Text variant='action'>Send</Text>
          </Button>
          <Button
            appearance='primary'
            disabled={!canTrade}
            label={`Trade ${asset.symbol}`}
            onPress={onTrade}
            shape='pill'
            size='large'
            title={canTrade ? `Trade ${asset.symbol}` : TRADE_DISABLED_CHAIN_LABEL}
            width='wide'
          >
            <Icon name='sync' size='small' />
            <Text variant='action'>Trade</Text>
          </Button>
        </Stack>
      </div>
    </div>
  )
}
