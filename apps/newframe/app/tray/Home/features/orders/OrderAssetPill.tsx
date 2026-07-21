import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { MediaBadge } from '@newframe/ui/media-badge'
import { Text } from '@newframe/ui/text'

import { imageSource } from '../../../../../resources/domain/image'
import { cva } from '../../../../../resources/styled-system/css/cva.js'
import { ChainIcon } from '../../components/ChainIcon'
import { orderAssetName, orderAssetSymbol } from './orderModel'

const assetPillRecipe = cva({
  base: {
    display: 'inline-flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '3',
    paddingBlock: '2',
    paddingInline: '4',
    borderRadius: 'pill',
    background: 'bg.control'
  }
})

export function OrderAssetPill({
  asset,
  fallbackChainId,
  networks,
  networksMeta,
  prefix = ''
}: {
  asset: any
  fallbackChainId?: number
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  prefix?: string
}) {
  const symbol = orderAssetSymbol(asset)
  const chainId = Number(asset?.chainId || fallbackChainId || 0)
  const logo = asset?.logoURI || asset?.logoUrl || asset?.icon
  const art = logo ? (
    <Image alt='' size='small' source={imageSource(logo)} />
  ) : symbol === 'ETH' || symbol === 'WETH' ? (
    <Icon name='ethereum' size='small' />
  ) : (
    <Text variant='supporting'>{symbol.substring(0, 1)}</Text>
  )
  const media = chainId ? (
    <MediaBadge
      badge={<ChainIcon chainId={chainId} networks={networks} networksMeta={networksMeta} size='compact' />}
      size='small'
    >
      {art}
    </MediaBadge>
  ) : (
    art
  )

  return (
    <span className={assetPillRecipe()} title={orderAssetName(asset)}>
      {prefix ? (
        <Text display='inline' tone='muted' variant='caption'>
          {prefix}
        </Text>
      ) : null}
      {media}
      <Text display='inline' variant='supporting'>
        {symbol}
      </Text>
    </span>
  )
}
