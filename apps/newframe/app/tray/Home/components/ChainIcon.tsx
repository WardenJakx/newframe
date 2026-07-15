import React from 'react'

import svg from '../../../../resources/svg'
import { cachedImageUrl } from '../../../../resources/domain/imageCache'
import { chainColorCssVariable } from '../../../../resources/style/tokens/colors'

export function ChainIcon({
  chainId,
  dotSize = 9,
  glyphSize = 12,
  imageSize = 16,
  networks,
  networksMeta
}: {
  chainId: number
  dotSize?: number
  glyphSize?: number
  imageSize?: number
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
}) {
  const metadata = networksMeta[chainId] || {}
  if (metadata.icon) {
    return <img alt='' src={cachedImageUrl(metadata.icon)} style={{ height: imageSize, width: imageSize }} />
  }

  const name = String(networks[chainId]?.name || '').toLowerCase()
  if (['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan'].includes(name)) {
    return svg.eth(glyphSize)
  }

  return (
    <div
      className='t2ChainIconDot'
      style={{
        background: chainColorCssVariable(metadata.primaryColor),
        height: dotSize,
        width: dotSize
      }}
    />
  )
}
