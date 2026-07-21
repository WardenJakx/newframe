import type { CSSProperties } from 'react'

import { Icon } from '@newframe/ui/icon'
import { persistedImageSource } from '../../../../resources/domain/image'
import { chainColorValue } from '../../../../resources/colors'
import { cva } from '../../../../resources/styled-system/css/cva.js'

const chainIconRecipe = cva({
  base: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: '50%',
    color: 'var(--chain-icon-color)',
    '& img': { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' },
    '& > span': { width: '100%', height: '100%' },
    '& svg': { width: '100%', height: '100%' }
  },
  variants: {
    kind: {
      art: {},
      dot: { background: 'var(--chain-icon-color)' },
      glyph: {}
    },
    size: {
      compact: { width: 'status-dot-small', height: 'status-dot-small' },
      small: { width: 'icon-small', height: 'icon-small' },
      medium: { width: 'icon-medium', height: 'icon-medium' },
      large: { width: 'icon-large', height: 'icon-large' }
    }
  },
  defaultVariants: { kind: 'art', size: 'medium' }
})

export function ChainIcon({
  chainId,
  networks,
  networksMeta,
  size = 'medium'
}: {
  chainId: number
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  size?: 'compact' | 'large' | 'medium' | 'small'
}) {
  const metadata = networksMeta[chainId] || {}
  const icon = persistedImageSource(metadata.image)
  if (icon) {
    return (
      <span className={chainIconRecipe({ kind: 'art', size })}>
        <img alt='' src={icon} />
      </span>
    )
  }

  const name = String(networks[chainId]?.name || '').toLowerCase()
  if (['mainnet', 'görli', 'goerli', 'sepolia', 'ropsten', 'rinkeby', 'kovan'].includes(name)) {
    return (
      <span className={chainIconRecipe({ kind: 'glyph', size })}>
        <Icon name='ethereum' />
      </span>
    )
  }

  return (
    <span
      className={chainIconRecipe({ kind: 'dot', size })}
      style={{ '--chain-icon-color': chainColorValue(metadata.primaryColor) } as CSSProperties}
    />
  )
}
