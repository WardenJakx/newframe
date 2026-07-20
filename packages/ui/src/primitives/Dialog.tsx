import type { MouseEvent, ReactNode } from 'react'

import { sva } from '../styled-system/css/sva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const dialogRecipe = sva({
  slots: ['backdrop', 'panel'],
  base: {
    backdrop: {
      position: 'absolute',
      inset: 0,
      zIndex: 'modal',
      display: 'flex',
      justifyContent: 'center',
      padding: '6',
      background: 'scrim'
    },
    panel: {
      minWidth: 0,
      width: '100%',
      maxWidth: 'page-compact',
      maxHeight: '100%',
      overflow: 'auto',
      borderRadius: 'card',
      background: 'bg.card',
      boxShadow: 'elevation-overlay'
    }
  },
  variants: {
    placement: {
      center: { backdrop: { alignItems: 'center' } },
      top: { backdrop: { alignItems: 'flex-start' } },
      bottom: { backdrop: { alignItems: 'flex-end' } }
    },
    padding: {
      none: { panel: { padding: 0 } },
      medium: { panel: { padding: '7' } },
      large: { panel: { padding: '11' } }
    },
    tone: {
      scrim: { backdrop: { background: 'scrim' } },
      opaque: { backdrop: { background: 'bg.primary' } }
    },
    width: {
      compact: { panel: { maxWidth: 'dialog-compact' } },
      default: { panel: { maxWidth: 'page-compact' } }
    }
  },
  defaultVariants: { padding: 'medium', placement: 'center', tone: 'scrim', width: 'default' }
})

export type DialogProps = RecipeVariantProps<typeof dialogRecipe> & {
  children: ReactNode
  label: string
  onDismiss?: () => void
}

export function Dialog({ children, label, onDismiss, padding, placement, tone, width }: DialogProps) {
  const styles = dialogRecipe({ padding, placement, tone, width })
  const dismiss = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onDismiss?.()
  }

  return (
    <div className={styles.backdrop} onMouseDown={dismiss}>
      <div aria-label={label} aria-modal='true' className={styles.panel} role='dialog'>
        {children}
      </div>
    </div>
  )
}
