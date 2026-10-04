import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { Image } from './Image.tsx'

const mediaIconRecipe = cva({
  base: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: '50%'
  },
  variants: {
    size: {
      inline: { width: 'icon-small', height: 'icon-small' },
      compact: { width: 'icon-large', height: 'icon-large' },
      asset: { width: 'icon-button-small', height: 'icon-button-small' },
      small: { width: 'media-small', height: 'media-small' },
      identity: { width: 'identity-icon', height: 'identity-icon' },
      control: { width: 'icon-button-medium', height: 'icon-button-medium' },
      medium: { width: 'media-medium', height: 'media-medium' },
      field: { width: 'field', height: 'field' },
      large: { width: 'media-large', height: 'media-large' }
    },
    border: {
      none: {},
      subtle: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'border.subtle' },
      default: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'border' },
      strong: { borderWidth: 'strong', borderStyle: 'solid', borderColor: 'border.strong' }
    },
    shape: {
      circle: {},
      control: { borderRadius: 'control' }
    },
    surface: {
      control: { background: 'bg.control' },
      transparent: { background: 'transparent' }
    },
    tone: {
      inherit: {},
      accent: { color: 'action.primary' },
      secondary: { color: 'text.secondary' }
    }
  },
  defaultVariants: { surface: 'control', border: 'none', shape: 'circle', size: 'small', tone: 'inherit' }
})

export type MediaIconProps = RecipeVariantProps<typeof mediaIconRecipe> & {
  alt?: string
  children?: ReactNode
  onLoadError?: () => void
  source?: string
}

export function MediaIcon({
  alt = '',
  border,
  children,
  onLoadError,
  shape,
  size,
  source,
  surface,
  tone
}: MediaIconProps) {
  return (
    <span className={mediaIconRecipe({ border, shape, size, surface, tone })}>
      {source ? <Image alt={alt} onLoadError={onLoadError} source={source} /> : children}
    </span>
  )
}
