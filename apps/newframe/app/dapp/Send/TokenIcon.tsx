import React from 'react'

import { cachedImageUrl } from '../../../resources/domain/imageCache'
import svg from '../../../resources/svg'

import type { SendEthereumNetwork, SendEthereumNetworkMeta } from '../../state/selectors/send'

interface TokenIconProps {
  asset?: {
    chainId?: number
    logoURI?: string
    symbol?: string
  } | null
  networks: Record<string | number, SendEthereumNetwork>
  networksMeta: Record<string | number, SendEthereumNetworkMeta>
}

const ethChains = ['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']

function chainColor(chainId: number | undefined, networksMeta: TokenIconProps['networksMeta']) {
  const primaryColor = chainId ? networksMeta[chainId]?.primaryColor : ''

  return primaryColor ? `var(--${primaryColor})` : 'var(--moon)'
}

function renderChainBadge({
  chainId,
  networks,
  networksMeta
}: {
  chainId?: number
  networks: TokenIconProps['networks']
  networksMeta: TokenIconProps['networksMeta']
}) {
  const icon = chainId ? networksMeta[chainId]?.icon : ''

  if (icon) {
    return <img src={cachedImageUrl(icon)} alt='' style={{ width: '18px', height: '18px' }} />
  }

  const chain = chainId ? networks[chainId] || {} : {}
  if (ethChains.includes((chain.name || '').toLowerCase())) return svg.eth(11)

  return (
    <div
      className='sendChainIconDot'
      style={{ background: chainColor(chainId, networksMeta), width: '9px', height: '9px' }}
    />
  )
}

export default function TokenIcon({ asset, networks, networksMeta }: TokenIconProps) {
  return (
    <div className='sendTokenIcon'>
      <div className='sendTokenIconInner'>
        {asset?.logoURI ? (
          <img src={cachedImageUrl(asset.logoURI)} alt='' />
        ) : (
          <span className='sendTokenIconGlyph'>{(asset?.symbol || '?').substring(0, 1)}</span>
        )}
      </div>
      <div className='sendTokenChainBadge'>
        {renderChainBadge({ chainId: asset?.chainId, networks, networksMeta })}
      </div>
    </div>
  )
}
