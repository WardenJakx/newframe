import { Image } from '@newframe/ui/image'
import { MediaBadge } from '@newframe/ui/media-badge'
import { StatusDot } from '@newframe/ui/status-dot'
import { Text } from '@newframe/ui/text'
import React from 'react'

import { imageSource, persistedImageSource } from '../../../features/asset-data/domain/image/index.ts'
import type { TokenImageCapability } from '../capabilities.ts'
import { useTokenImageHydration } from '../hooks/useTokenImageHydration.ts'
import type { ChainTokenIconSize, ChainLike, ChainMetaLike } from './tokenSelectorTypes.ts'

interface ChainTokenIconProps {
  chainId: number
  imageCapability: TokenImageCapability
  logoURI?: string
  chains: Partial<Record<string | number, ChainLike>>
  chainsMeta: Partial<Record<string | number, ChainMetaLike>>
  size?: ChainTokenIconSize
  symbol: string
  tokenId?: string
}

const ethChains = ['ethereum', 'mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']

function symbolFallback(symbol: string) {
  return symbol ? symbol.slice(0, 5) : '?'
}

function warnImageFailure(message: string, details: Record<string, unknown>) {
  console.warn(`[ChainTokenIcon] ${message}`, details)
}

export default function ChainTokenIcon({
  chainId,
  imageCapability,
  logoURI = '',
  chains,
  chainsMeta,
  size = 'md',
  symbol,
  tokenId
}: ChainTokenIconProps) {
  const hydrationTarget = React.useRef<HTMLSpanElement>(null)
  const [failedTokenUrl, setFailedTokenUrl] = React.useState('')
  const [failedChainUrl, setFailedChainUrl] = React.useState('')
  const chainMetadata = chainsMeta[chainId]
  const chainIconUrl = persistedImageSource(chainMetadata?.image)
  const tokenImageSource = imageSource(logoURI)
  const chainImageSource = imageSource(chainIconUrl)
  const tokenImageVisible = !!tokenImageSource && failedTokenUrl !== logoURI
  const chainImageVisible = !!chainImageSource && failedChainUrl !== chainIconUrl
  const chain = chains[chainId] ?? {}
  const chainName = (chain.name ?? '').toLowerCase()

  useTokenImageHydration(imageCapability, tokenId, !!tokenImageSource, hydrationTarget)

  const renderChainBadge = () => {
    if (chainImageVisible) {
      return (
        <Image
          alt=''
          source={chainImageSource}
          onLoadError={() => {
            setFailedChainUrl(chainIconUrl)
            warnImageFailure('failed to load chain image', { chainId, symbol, url: chainIconUrl })
          }}
        />
      )
    }

    if (ethChains.includes(chainName)) {
      return (
        <Text decorative display='inline' variant='caption'>
          Ξ
        </Text>
      )
    }

    return <StatusDot size={size === 'sm' ? 'small' : 'medium'} />
  }

  return (
    <MediaBadge
      badge={renderChainBadge()}
      decorative
      rootRef={hydrationTarget}
      size={size === 'sm' ? 'small' : 'medium'}
    >
      {tokenImageVisible ? (
        <Image
          alt=''
          source={tokenImageSource}
          onLoadError={() => {
            setFailedTokenUrl(logoURI)
            warnImageFailure('failed to load token image', { chainId, symbol, url: logoURI })
          }}
        />
      ) : (
        <Text align='center' display='inline' variant={size === 'sm' ? 'micro' : 'detail'} truncate>
          {symbolFallback(symbol)}
        </Text>
      )}
    </MediaBadge>
  )
}
