import React from 'react'
import { Image } from '@newframe/ui/image'
import { MediaBadge } from '@newframe/ui/media-badge'
import { StatusDot } from '@newframe/ui/status-dot'
import { Text } from '@newframe/ui/text'

import { imageSource } from '../domain/image'
import type { ChainTokenIconSize, NetworkLike, NetworkMetaLike } from './tokenSelectorTypes'

interface ChainTokenIconProps {
  chainId: number
  logoURI?: string
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  size?: ChainTokenIconSize
  symbol: string
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
  logoURI = '',
  networks,
  networksMeta,
  size = 'md',
  symbol
}: ChainTokenIconProps) {
  const [failedTokenUrl, setFailedTokenUrl] = React.useState('')
  const [failedChainUrl, setFailedChainUrl] = React.useState('')
  const chainIconUrl = networksMeta[chainId]?.icon || ''
  const tokenImageVisible = !!logoURI && failedTokenUrl !== logoURI
  const chainImageVisible = !!chainIconUrl && failedChainUrl !== chainIconUrl
  const chain = networks[chainId] || {}
  const chainName = (chain.name || '').toLowerCase()

  React.useEffect(() => {
    setFailedTokenUrl('')
  }, [logoURI])

  React.useEffect(() => {
    setFailedChainUrl('')
  }, [chainIconUrl])

  const renderChainBadge = () => {
    if (chainImageVisible) {
      return (
        <Image
          alt=''
          source={imageSource(chainIconUrl)}
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
    <MediaBadge badge={renderChainBadge()} decorative size={size === 'sm' ? 'small' : 'medium'}>
      {tokenImageVisible ? (
        <Image
          alt=''
          source={imageSource(logoURI)}
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
