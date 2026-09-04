import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { Image } from './Image'

const mediaIconRecipe = cva({
  base: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: '50%',
    background: 'bg.control',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' }
  },
  variants: {
    size: {
      compact: { width: 'icon-large', height: 'icon-large' },
      small: { width: 'media-small', height: 'media-small' },
      medium: { width: 'media-medium', height: 'media-medium' }
    }
  },
  defaultVariants: { size: 'small' }
})

export type MediaIconProps = RecipeVariantProps<typeof mediaIconRecipe> & {
  alt?: string
  source?: string
}

export function MediaIcon({ alt = '', size, source }: MediaIconProps) {
  return (
    <span className={mediaIconRecipe({ size })}>
      {source ? <Image alt={alt} size='fill' source={source} /> : null}
    </span>
  )
}
