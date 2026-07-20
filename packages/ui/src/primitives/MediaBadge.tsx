import type { ReactNode } from 'react'

import { sva } from '../styled-system/css/sva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const mediaBadgeRecipe = sva({
  slots: ['root', 'media', 'badge', 'badgeContent'],
  base: {
    root: { position: 'relative', flexShrink: 0 },
    media: {
      display: 'grid',
      width: '100%',
      height: '100%',
      placeItems: 'center',
      overflow: 'hidden',
      borderWidth: 'thin',
      borderStyle: 'solid',
      borderColor: 'border',
      borderRadius: '50%',
      background: 'bg.control',
      color: 'text.secondary'
    },
    badge: {
      position: 'absolute',
      insetBlockStart: 'calc(-1 * token(spacing.7) / 2)',
      insetInlineStart: 'calc(-1 * token(spacing.7) / 2)',
      display: 'grid',
      width: 'media-badge-medium',
      height: 'media-badge-medium',
      placeItems: 'center',
      overflow: 'hidden',
      borderWidth: 'strong',
      borderStyle: 'solid',
      borderColor: 'bg.primary',
      borderRadius: '50%',
      background: 'bg.control'
    },
    badgeContent: {
      display: 'grid',
      width: 'media-art-medium',
      height: 'media-art-medium',
      placeItems: 'center',
      overflow: 'hidden',
      borderRadius: '50%'
    }
  },
  variants: {
    size: {
      small: {
        root: { width: 'media-small', height: 'media-small' },
        badge: {
          insetBlockStart: 'calc(-1 * token(spacing.5) / 2)',
          insetInlineStart: 'calc(-1 * token(spacing.5) / 2)',
          width: 'media-badge-small',
          height: 'media-badge-small'
        },
        badgeContent: { width: 'media-art-small', height: 'media-art-small' }
      },
      medium: {
        root: { width: 'media-medium', height: 'media-medium' }
      }
    }
  },
  defaultVariants: { size: 'medium' }
})

export type MediaBadgeProps = RecipeVariantProps<typeof mediaBadgeRecipe> & {
  badge: ReactNode
  children: ReactNode
  decorative?: boolean
}

export function MediaBadge({ badge, children, decorative = false, size }: MediaBadgeProps) {
  const styles = mediaBadgeRecipe({ size })
  return (
    <span aria-hidden={decorative || undefined} className={styles.root}>
      <span className={styles.media}>{children}</span>
      <span className={styles.badge}>
        <span className={styles.badgeContent}>{badge}</span>
      </span>
    </span>
  )
}
