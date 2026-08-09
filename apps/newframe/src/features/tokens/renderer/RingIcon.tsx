import { Icon, type IconName, type IconProps as UiIconProps } from '@newframe/ui/icon'
import type { CSSProperties } from 'react'

import { imageSource } from '../../asset-data/domain/image'
import { sva } from '../../../../generated/styled-system/css/sva.js'

const ringRecipe = sva({
  slots: ['root', 'inner'],
  base: {
    root: {
      position: 'relative',
      display: 'grid',
      width: 'identity-icon',
      height: 'identity-icon',
      placeItems: 'center',
      flexShrink: 0,
      borderWidth: 'strong',
      borderStyle: 'solid',
      borderColor: 'var(--ring-color)',
      borderRadius: '50%',
      background: 'bg.control'
    },
    inner: {
      position: 'absolute',
      inset: '2',
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden',
      borderRadius: '50%',
      background: 'var(--ring-color)',
      color: 'bg.control',
      '& img': { width: '100%', height: '100%', objectFit: 'cover' }
    }
  },
  variants: {
    block: {
      true: { inner: { background: 'bg.control', color: 'var(--ring-color)' } },
      false: {}
    },
    noRing: {
      true: { root: { border: 0, borderRadius: 0, background: 'transparent' }, inner: { borderRadius: 0 } },
      false: {}
    },
    small: {
      true: { root: { width: 'icon-button-small', height: 'icon-button-small' }, inner: { inset: '1' } },
      false: {}
    }
  },
  defaultVariants: { block: false, noRing: false, small: false }
})

interface IconProps {
  svgName?: IconName
  alt?: string
  svgSize?: number
  img?: string
  small?: boolean
}

interface RingIconProps extends IconProps {
  block?: boolean
  color?: string
  noRing?: boolean
}

function iconSize(svgSize: number, small?: boolean): UiIconProps['size'] {
  if (small || svgSize <= 13) return 'small'
  return svgSize >= 18 ? 'large' : 'medium'
}

const Glyph = ({ svgName, alt = '', svgSize = 16, img, small }: IconProps) => {
  const source = imageSource(img)
  if (source) {
    return <img src={source} alt={alt} />
  }
  if (svgName) {
    const iconName = svgName.toLowerCase()
    const ethChains = ['mainnet', 'görli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']
    if (ethChains.includes(iconName)) {
      return <Icon name='ethereum' size={small ? 'small' : 'large'} />
    }
    return <Icon name={svgName} size={iconSize(svgSize, small)} />
  }

  return <Icon name='ethereum' size={small ? 'small' : 'large'} />
}

export default function RingIcon({ color, svgName, svgSize, img, small, block, noRing, alt }: RingIconProps) {
  const styles = ringRecipe({ block, noRing, small })
  return (
    <span className={styles.root} style={{ '--ring-color': color || 'currentColor' } as CSSProperties}>
      <span className={styles.inner}>
        <Glyph svgName={svgName} svgSize={svgSize} img={img} alt={alt} small={small} />
      </span>
    </span>
  )
}
