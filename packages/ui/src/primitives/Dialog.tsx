import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const dialogRecipe = cva({
  base: {
    width: 'calc(100% - token(spacing.6) * 2)',
    maxHeight: 'calc(100% - token(spacing.6) * 2)',
    border: 0,
    overflow: 'auto',
    borderRadius: 'card',
    background: 'bg.card',
    color: 'inherit',
    boxShadow: 'elevation-overlay'
  },
  variants: {
    placement: {
      // The top layer positions dialogs fixed; a single inset pins the edge instead of centering.
      center: {},
      top: { insetBlockStart: '6', insetBlockEnd: 'auto' },
      bottom: { insetBlockStart: 'auto', insetBlockEnd: '6' }
    },
    padding: {
      none: { padding: 0 },
      medium: { padding: '7' },
      large: { padding: '11' }
    },
    tone: {
      scrim: { _backdrop: { background: 'scrim' } },
      opaque: { _backdrop: { background: 'bg.primary' } }
    },
    width: {
      compact: { maxWidth: 'dialog-compact' },
      default: { maxWidth: 'page-compact' }
    }
  },
  defaultVariants: { padding: 'medium', placement: 'center', tone: 'scrim', width: 'default' }
})

export type DialogProps = RecipeVariantProps<typeof dialogRecipe> & {
  children: ReactNode
  label: string
  /** Escape and clicks outside the dialog call this; without it the dialog cannot be dismissed. */
  onDismiss?: () => void
}

export function Dialog({ children, label, onDismiss, padding, placement, tone, width }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  // showModal() puts the dialog in the top layer, makes the page inert, moves focus in and
  // restores it on close. Closing before React removes the node keeps that restore working.
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      aria-label={label}
      className={dialogRecipe({ padding, placement, tone, width })}
      closedby={onDismiss ? 'any' : 'none'}
      onCancel={(event) => {
        // React owns open state: unmounting closes the dialog.
        event.preventDefault()
        onDismiss?.()
      }}
      ref={dialog}
    >
      {children}
    </dialog>
  )
}
