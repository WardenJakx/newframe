import svg from '../../../../../resources/svg'
import { cachedImageUrl } from '../../../../../resources/domain/imageCache'
import { ChainIcon } from '../../components/ChainIcon'
import { orderAssetName, orderAssetSymbol } from './orderModel'

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

  return (
    <div className='t2OrderAssetPill' title={orderAssetName(asset)}>
      {prefix ? <span className='traySpan t2OrderAssetPrefix'>{prefix}</span> : null}
      <div className='t2OrderAssetIcon'>
        <div className='t2OrderAssetIconInner'>
          {logo ? (
            <img alt='' src={cachedImageUrl(logo)} />
          ) : symbol === 'USDC' ? (
            svg.usd(14)
          ) : symbol === 'ETH' || symbol === 'WETH' ? (
            svg.eth(14)
          ) : (
            <span className='traySpan'>{symbol.substring(0, 1)}</span>
          )}
        </div>
        {chainId ? (
          <div className='t2OrderAssetChainBadge'>
            <ChainIcon
              chainId={chainId}
              dotSize={6}
              glyphSize={8}
              imageSize={12}
              networks={networks}
              networksMeta={networksMeta}
            />
          </div>
        ) : null}
      </div>
      <span className='traySpan'>{symbol}</span>
    </div>
  )
}
