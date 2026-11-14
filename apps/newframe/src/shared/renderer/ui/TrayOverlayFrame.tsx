import type { KeyboardEventHandler, ReactNode, Ref } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'

const overlayRecipe = cva({
  // Open in place (not showModal): HomeOverlayRouter stacks these layers and manages focus.
  base: {
    position: 'absolute',
    inset: 0,
    width: 'auto',
    height: 'auto',
    maxWidth: 'none',
    maxHeight: 'none',
    padding: 0,
    border: 0,
    color: 'inherit',
    zIndex: 'overlay',
    display: 'flex',
    flexDirection: 'column',
    background: 'bg.primary'
  },
  variants: {
    layout: {
      plain: { overflow: 'hidden' },
      tray: {
        minHeight: 0,
        '& > header': { position: 'relative', zIndex: 'content', background: 'bg.primary' },
        animation: 'overlayShow token(durations.fast) token(easings.standard) both'
      },
      menu: {
        padding: '8',
        animationName: 'overlayShow',
        animationDuration: 'fast',
        animationTimingFunction: 'linear',
        animationFillMode: 'both',
        _motionReduce: { animationDuration: 'reduced' }
      }
    }
  },
  defaultVariants: { layout: 'plain' }
})

export type TrayOverlayFrameProps = {
  children: ReactNode
  label: string
  layout?: 'menu' | 'plain' | 'tray'
  modal?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  ref?: Ref<HTMLDialogElement>
}

export function TrayOverlayFrame({ children, label, layout, modal, onKeyDown, ref }: TrayOverlayFrameProps) {
  return (
    <dialog
      aria-label={label}
      aria-modal={modal ? true : undefined}
      className={overlayRecipe({ layout })}
      onKeyDown={onKeyDown}
      open
      ref={ref}
    >
      {children}
    </dialog>
  )
}
