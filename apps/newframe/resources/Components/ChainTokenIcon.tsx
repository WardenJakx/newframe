import React from 'react'
import { AssetSelectorImage, AssetSelectorPanel, AssetSelectorText } from '@newframe/ui/asset-selector'
import { Icon } from '@newframe/ui/icon'

import { cachedImageUrl } from '../domain/imageCache'
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
        <AssetSelectorImage
          alt=''
          src={cachedImageUrl(chainIconUrl)}
          onError={() => {
            setFailedChainUrl(chainIconUrl)
            warnImageFailure('failed to load chain image', { chainId, symbol, url: chainIconUrl })
          }}
        />
      )
    }

    if (ethChains.includes(chainName)) {
      return (
        <AssetSelectorPanel variants='chainTokenIconChainGlyph'>
          <Icon name='ethereum' size='small' />
        </AssetSelectorPanel>
      )
    }

    return <AssetSelectorPanel variants='chainTokenIconChainDot' />
  }

  return (
    <AssetSelectorPanel
      aria-hidden='true'
      variants={['chainTokenIcon', size === 'sm' ? 'chainTokenIconSm' : 'chainTokenIconMd']}
    >
      <AssetSelectorPanel variants='chainTokenIconInner'>
        {tokenImageVisible ? (
          <AssetSelectorImage
            alt=''
            src={cachedImageUrl(logoURI)}
            onError={() => {
              setFailedTokenUrl(logoURI)
              warnImageFailure('failed to load token image', { chainId, symbol, url: logoURI })
            }}
          />
        ) : (
          <AssetSelectorText variants='chainTokenIconSymbol'>{symbolFallback(symbol)}</AssetSelectorText>
        )}
      </AssetSelectorPanel>
      <AssetSelectorPanel variants='chainTokenIconChainBadge'>{renderChainBadge()}</AssetSelectorPanel>
    </AssetSelectorPanel>
  )
}
