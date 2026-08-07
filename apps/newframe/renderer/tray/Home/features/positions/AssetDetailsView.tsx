import React from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import ChainTokenIcon from '../../../../shared/ui/ChainTokenIcon'
import { AddressIdentity } from '../../../../shared/ui/AddressIdentity'
import { DetailRow } from '../../../../shared/ui/DetailRow'
import { TrayOverlay } from '../../../../shared/ui/TrayOverlay'
import { formatUsdRate, isNativeCurrency, type DisplayedBalance } from '../../../../../domain/balance'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { ChainIcon } from '../../components/ChainIcon'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions'

const contentRecipe = cva({ base: { paddingBlockStart: '4' } })

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
  const price = Number(asset?.rate?.usdRate || 0)
  const nativeAsset = isNativeCurrency(asset.address)
  const detailRow = (label: string, value: React.ReactNode, monospace = false) => (
    <DetailRow code={monospace} label={label} value={value} />
  )
  const footer = (
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
        <Text tone='inverse' variant='action'>
          Send
        </Text>
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
        <Text tone='inverse' variant='action'>
          Trade
        </Text>
      </Button>
    </Stack>
  )

  return (
    <TrayOverlay
      closeLabel='Back to positions'
      footer={footer}
      footerAppearance='plain'
      label='Asset details'
      onClose={onBack}
      title={asset.symbol}
    >
      <div className={contentRecipe()}>
        <Stack gap='small'>
          <Stack align='center' direction='row' gap='small'>
            <ChainTokenIcon
              chainId={asset.chainId}
              logoURI={asset.logoURI}
              networks={networks}
              networksMeta={networksMeta}
              size='md'
              symbol={asset.symbol}
              tokenId={`${asset.chainId}:${asset.address}`}
            />
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
          </Stack>
          <Stack gap='none'>
            {detailRow('Price', asset.hasPrice ? (price > 0 ? `$${formatUsdRate(price, 2)}` : '$0.00') : '—')}
            {detailRow('Balance', `${asset.displayBalance} ${asset.symbol}`)}
            {detailRow(
              'Chain',
              <Stack align='center' direction='row' gap='xsmall' justify='end'>
                <ChainIcon
                  chainId={asset.chainId}
                  networks={networks}
                  networksMeta={networksMeta}
                  size='large'
                />
                <Text truncate variant='label'>
                  {chain.name || `Chain ${asset.chainId}`}
                </Text>
              </Stack>
            )}
            {nativeAsset ? (
              detailRow('Contract Address', 'Native asset')
            ) : (
              <DetailRow code label='Contract Address' value={<AddressIdentity address={asset.address} />} />
            )}
          </Stack>
        </Stack>
      </div>
    </TrayOverlay>
  )
}
