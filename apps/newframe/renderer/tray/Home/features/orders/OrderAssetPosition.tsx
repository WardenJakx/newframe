import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { tokenForId, tokenImageSource } from '../../../../../domain/token'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import ChainTokenIcon from '../../../../shared/ui/ChainTokenIcon'
import { orderAssetName, orderAssetSymbol } from './orderModel'

const assetPositionRecipe = cva({
  base: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '2'
  },
  variants: {
    align: {
      start: { alignItems: 'flex-start' },
      end: { alignItems: 'flex-end' }
    }
  }
})

function orderAssetId(asset: any) {
  const chainId = Number(asset?.chainId || 0)
  const address = String(asset?.address || '')
    .trim()
    .toLowerCase()

  return String(
    asset?.id || (chainId && address ? `${chainId}:${address}` : `${chainId}:${orderAssetSymbol(asset)}`)
  )
}

export function OrderAssetIcon({
  asset,
  networks,
  networksMeta,
  tokens
}: {
  asset: any
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  tokens?: any
}) {
  const symbol = orderAssetSymbol(asset)
  const chainId = Number(asset?.chainId || 0)
  const tokenId = orderAssetId(asset)
  const canonicalImage = tokens ? tokenImageSource(tokenForId(tokens, tokenId)) : ''

  return (
    <ChainTokenIcon
      chainId={chainId}
      logoURI={canonicalImage || asset?.logoURI || asset?.logoUrl || asset?.icon}
      networks={networks}
      networksMeta={networksMeta}
      size='md'
      symbol={symbol}
      tokenId={tokenId}
    />
  )
}

export function OrderAssetPosition({
  align,
  amount,
  asset,
  networks,
  networksMeta,
  notional
}: {
  align: 'start' | 'end'
  amount?: string
  asset: any
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  notional?: string
}) {
  const symbol = orderAssetSymbol(asset)
  const amountLabel = amount && amount !== '—' ? `${amount} ${symbol}` : '—'

  return (
    <div className={assetPositionRecipe({ align })} title={orderAssetName(asset)}>
      <Stack align='center' direction='row' gap='xsmall'>
        <OrderAssetIcon asset={asset} networks={networks} networksMeta={networksMeta} />
        <Text align={align} variant='label' truncate>
          {symbol}
        </Text>
      </Stack>
      <Text align={align} variant='numeric' truncate>
        {amountLabel}
      </Text>
      <Text align={align} tone='muted' variant='caption' truncate>
        {notional || '—'}
      </Text>
    </div>
  )
}
