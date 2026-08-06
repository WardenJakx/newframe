import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { FLASH_NATIVE_ETH_TOKEN_ADDRESS } from '../../../../../domain/flash/constants'
import { persistedImageSource } from '../../../../../domain/image'
import { tokenForId, tokenImageSource } from '../../../../../domain/token'
import { NATIVE_CURRENCY } from '../../../../../domain/token/constants'
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

function orderAssetIdentity(asset: any) {
  const chainId = Number(asset?.chainId || 0)
  const address = String(asset?.address || '')
    .trim()
    .toLowerCase()
  const isNative =
    asset?.isNative === true || address === NATIVE_CURRENCY || address === FLASH_NATIVE_ETH_TOKEN_ADDRESS
  const catalogAddress = isNative ? NATIVE_CURRENCY : address
  const tokenId = String(
    chainId && catalogAddress
      ? `${chainId}:${catalogAddress}`
      : asset?.id || `${chainId}:${orderAssetSymbol(asset)}`
  )

  return { chainId, isNative, tokenId }
}

export function OrderAssetIcon({
  asset,
  imageSource,
  networks,
  networksMeta,
  tokens
}: {
  asset: any
  imageSource?: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  tokens?: any
}) {
  const symbol = orderAssetSymbol(asset)
  const { chainId, isNative, tokenId } = orderAssetIdentity(asset)
  const resolvedImage = resolveOrderAssetImageSource({ asset, networksMeta, tokens })

  return (
    <ChainTokenIcon
      chainId={chainId}
      logoURI={imageSource || resolvedImage}
      networks={networks}
      networksMeta={networksMeta}
      size='md'
      symbol={symbol}
      tokenId={isNative ? undefined : tokenId}
    />
  )
}

export function resolveOrderAssetImageSource({
  asset,
  networksMeta,
  tokens
}: {
  asset: any
  networksMeta: Record<string | number, any>
  tokens?: any
}) {
  const { chainId, isNative, tokenId } = orderAssetIdentity(asset)
  const canonicalImage = tokens ? tokenImageSource(tokenForId(tokens, tokenId)) : ''
  const nativeCurrency = networksMeta[chainId]?.nativeCurrency || {}
  const nativeImage = isNative ? persistedImageSource(nativeCurrency.image) : ''

  return (
    canonicalImage ||
    nativeImage ||
    (isNative ? nativeCurrency.icon : '') ||
    asset?.logoURI ||
    asset?.logoUrl ||
    asset?.icon ||
    ''
  )
}

export function OrderAssetPosition({
  align,
  amount,
  asset,
  imageSource,
  networks,
  networksMeta,
  notional,
  tokens
}: {
  align: 'start' | 'end'
  amount?: string
  asset: any
  imageSource?: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  notional?: string
  tokens: any
}) {
  const symbol = orderAssetSymbol(asset)
  const amountLabel = amount && amount !== '—' ? `${amount} ${symbol}` : '—'

  return (
    <div className={assetPositionRecipe({ align })} title={orderAssetName(asset)}>
      <Stack align='center' direction='row' gap='xsmall'>
        <OrderAssetIcon
          asset={asset}
          imageSource={imageSource}
          networks={networks}
          networksMeta={networksMeta}
          tokens={tokens}
        />
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
