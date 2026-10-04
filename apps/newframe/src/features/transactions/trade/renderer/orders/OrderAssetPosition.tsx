import { FLASH_NATIVE_ETH_TOKEN_ADDRESS } from '@newframe/flash/constants'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import type { TokenImageCapability } from '../../../../../shared/renderer/capabilities.ts'
import ChainTokenIcon from '../../../../../shared/renderer/ui/ChainTokenIcon.tsx'
import { persistedImageSource } from '../../../../asset-data/domain/image/index.ts'
import { NATIVE_CURRENCY } from '../../../../tokens/domain/constants.ts'
import { tokenForId, tokenImageSource } from '../../../../tokens/domain/index.ts'
import { orderAssetName, orderAssetSymbol } from './orderModel.ts'
import type { OrderAsset, OrderChainMap, OrderChainMetadataMap, OrderTokenCatalog } from './orderTypes.ts'

function orderAssetIdentity(asset?: OrderAsset) {
  const chainId = Number(asset?.chainId ?? 0)
  const address = String(asset?.address ?? '')
    .trim()
    .toLowerCase()
  const isNative =
    asset?.isNative === true || address === NATIVE_CURRENCY || address === FLASH_NATIVE_ETH_TOKEN_ADDRESS
  const catalogAddress = isNative ? NATIVE_CURRENCY : address
  const tokenId = String(
    chainId && catalogAddress
      ? `${chainId}:${catalogAddress}`
      : (asset?.id ?? `${chainId}:${orderAssetSymbol(asset)}`)
  )

  return { chainId, isNative, tokenId }
}

export function OrderAssetIcon({
  asset,
  imageSource,
  imageCapability,
  chains,
  chainsMeta,
  tokens
}: {
  asset?: OrderAsset
  imageSource?: string
  imageCapability: TokenImageCapability
  chains: OrderChainMap
  chainsMeta: OrderChainMetadataMap
  tokens?: OrderTokenCatalog
}) {
  const symbol = orderAssetSymbol(asset)
  const { chainId, isNative, tokenId } = orderAssetIdentity(asset)
  const resolvedImage = resolveOrderAssetImageSource({ asset, chainsMeta, tokens })

  return (
    <ChainTokenIcon
      chainId={chainId}
      imageCapability={imageCapability}
      logoURI={imageSource ?? resolvedImage}
      chains={chains}
      chainsMeta={chainsMeta}
      size='md'
      symbol={symbol}
      tokenId={isNative ? undefined : tokenId}
    />
  )
}

export function resolveOrderAssetImageSource({
  asset,
  chainsMeta,
  tokens
}: {
  asset?: OrderAsset
  chainsMeta: OrderChainMetadataMap
  tokens?: OrderTokenCatalog
}) {
  const { chainId, isNative, tokenId } = orderAssetIdentity(asset)
  const canonicalImage = tokens ? tokenImageSource(tokenForId(tokens, tokenId)) : ''
  const nativeCurrency = chainsMeta[chainId]?.nativeCurrency ?? {}
  const nativeImage = isNative ? persistedImageSource(nativeCurrency.image) : ''

  return (
    (canonicalImage || nativeImage || (isNative ? nativeCurrency.icon : '')) ??
    asset?.logoURI ??
    asset?.logoUrl ??
    asset?.icon ??
    ''
  )
}

export function OrderAssetPosition({
  align,
  amount,
  asset,
  imageSource,
  imageCapability,
  chains,
  chainsMeta,
  notional,
  tokens
}: {
  align: 'start' | 'end'
  amount?: string
  asset?: OrderAsset
  imageSource?: string
  imageCapability: TokenImageCapability
  chains: OrderChainMap
  chainsMeta: OrderChainMetadataMap
  notional?: string
  tokens: OrderTokenCatalog
}) {
  const symbol = orderAssetSymbol(asset)
  const amountLabel = amount && amount !== '—' ? `${amount} ${symbol}` : '—'

  return (
    <Stack align={align} gap='xsmall' title={orderAssetName(asset)}>
      <Stack align='center' direction='row' gap='xsmall'>
        <OrderAssetIcon
          asset={asset}
          imageCapability={imageCapability}
          imageSource={imageSource}
          chains={chains}
          chainsMeta={chainsMeta}
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
        {notional ?? '—'}
      </Text>
    </Stack>
  )
}
