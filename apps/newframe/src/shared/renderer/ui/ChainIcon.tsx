import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { StatusDot } from '@newframe/ui/status-dot'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { persistedImageSource } from '../../../features/asset-data/domain/image/index.ts'
import { chainColorValue } from '../../../features/chains/domain/chain/colors.ts'
import type { ChainLike, ChainMetaLike } from './tokenSelectorTypes.ts'

const chainIconRecipe = cva({
  base: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: '50%',
    overflow: 'hidden'
  },
  variants: {
    size: {
      compact: { width: 'status-dot-small', height: 'status-dot-small' },
      small: { width: 'icon-small', height: 'icon-small' },
      medium: { width: 'icon-medium', height: 'icon-medium' },
      large: { width: 'icon-large', height: 'icon-large' }
    }
  },
  defaultVariants: { size: 'medium' }
})

export interface ChainIconProps {
  chainId: number
  chains: Partial<Record<string | number, ChainLike>>
  chainsMeta: Partial<Record<string | number, ChainMetaLike>>
  size?: 'compact' | 'large' | 'medium' | 'small'
}

export function ChainIcon({ chainId, chains, chainsMeta, size = 'medium' }: ChainIconProps) {
  const metadata = chainsMeta[chainId]
  const icon = persistedImageSource(metadata?.image)
  if (icon) {
    return (
      <span className={chainIconRecipe({ size })}>
        <Image alt='' source={icon} />
      </span>
    )
  }

  const name = String(chains[chainId]?.name ?? '').toLowerCase()
  if (['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan'].includes(name)) {
    return (
      <span className={chainIconRecipe({ size })}>
        <Icon name='ethereum' size='fill' />
      </span>
    )
  }

  return (
    <span className={chainIconRecipe({ size })}>
      <StatusDot color={chainColorValue(metadata?.primaryColor)} size='fill' />
    </span>
  )
}
