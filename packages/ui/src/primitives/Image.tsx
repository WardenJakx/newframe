import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const imageRecipe = cva({
  base: { flex: 'none', objectFit: 'cover' },
  variants: {
    size: {
      fill: { width: '100%', height: '100%' },
      small: { width: 'icon-large', height: 'icon-large' },
      medium: { width: 'identity-icon', height: 'identity-icon' }
    }
  },
  defaultVariants: { size: 'fill' }
})

export type ImageProps = RecipeVariantProps<typeof imageRecipe> & {
  alt: string
  onLoadError?: () => void
  source: string
}

export function Image({ alt, onLoadError, size, source }: ImageProps) {
  return <img alt={alt} className={imageRecipe({ size })} onError={onLoadError} src={source} />
}
