import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ReactNode } from 'react'

import './button.css'

const buttonRecipe = cva('nf-button', {
  variants: {
    appearance: {
      primary: 'nf-button--primary',
      danger: 'nf-button--danger',
      ghost: 'nf-button--ghost',
      subtle: 'nf-button--subtle',
      tab: 'nf-button--tab',
      row: 'nf-button--row',
      disclosure: 'nf-button--disclosure'
    },
    size: {
      compact: 'nf-button--compact',
      small: 'nf-button--small',
      medium: 'nf-button--medium',
      large: 'nf-button--large'
    },
    shape: {
      rounded: 'nf-button--rounded',
      pill: 'nf-button--pill',
      circle: 'nf-button--circle'
    },
    active: {
      true: 'nf-button--active',
      false: null
    }
  },
  defaultVariants: {
    active: false,
    appearance: 'ghost',
    shape: 'rounded',
    size: 'medium'
  }
})

export type ButtonProps = VariantProps<typeof buttonRecipe> & {
  children: ReactNode
  controls?: string
  disabled?: boolean
  expanded?: boolean
  hasPopup?: 'dialog' | 'listbox' | 'menu'
  label?: string
  onPress?: () => void
  pressed?: boolean
  selected?: boolean
  title?: string
  type?: 'button' | 'reset' | 'submit'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    active,
    appearance,
    children,
    controls,
    disabled,
    expanded,
    hasPopup,
    label,
    onPress,
    pressed,
    selected,
    shape,
    size,
    title,
    type = 'button'
  },
  ref
) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      aria-label={label}
      aria-pressed={pressed}
      aria-selected={selected}
      className={buttonRecipe({ active, appearance, shape, size })}
      disabled={disabled}
      onClick={onPress}
      ref={ref}
      role={selected === undefined ? undefined : 'tab'}
      title={title}
      type={type}
    >
      {children}
    </button>
  )
})
