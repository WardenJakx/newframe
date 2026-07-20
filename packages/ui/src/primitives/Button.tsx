import { forwardRef, type ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

export const buttonRecipe = cva({
  base: {
    border: 0,
    outline: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4',
    paddingInline: '5',
    cursor: 'pointer',
    color: 'text.primary',
    _disabled: { cursor: 'default', opacity: 'disabled' },
    _focusVisible: {
      outlineWidth: 'focus',
      outlineStyle: 'solid',
      outlineColor: 'border.focus',
      outlineOffset: 'focus-outline-offset'
    }
  },
  variants: {
    appearance: {
      primary: {
        background: 'action.primary',
        color: 'action.primary.text',
        '&:hover:not(:disabled)': { background: 'action.primary.hover' }
      },
      danger: {
        background: 'action.danger.subtle',
        color: 'action.danger',
        '&:hover:not(:disabled)': {
          background: 'action.danger.border',
          color: 'action.danger.hover'
        }
      },
      ghost: {
        background: 'transparent',
        color: 'text.secondary',
        '&:hover:not(:disabled)': { background: 'bg.hover', color: 'text.primary' },
        _focusVisible: { background: 'bg.hover', color: 'text.primary' }
      },
      subtle: { background: 'action.primary.subtle', color: 'action.primary' },
      menu: { background: 'action.primary.text', color: 'text.primary' },
      control: {
        background: 'bg.control',
        color: 'text.primary',
        '&:hover:not(:disabled)': { background: 'bg.hover' },
        _focusVisible: { background: 'bg.hover' }
      },
      row: {
        width: '100%',
        justifyContent: 'flex-start',
        background: 'bg.control',
        textAlign: 'left',
        '&:hover:not(:disabled)': { background: 'bg.hover', color: 'text.primary' }
      },
      segment: {
        background: 'transparent',
        color: 'text.secondary',
        '&:hover:not(:disabled)': { background: 'border.subtle', color: 'text.primary' }
      },
      tab: {
        flex: '1 1 0',
        background: 'transparent',
        color: 'text.secondary',
        _hover: { background: 'border.subtle', color: 'text.primary' }
      },
      disclosure: {
        width: '100%',
        justifyContent: 'flex-start',
        paddingInline: '2',
        borderBlockWidth: 'thin',
        borderBlockStyle: 'solid',
        borderBlockColor: 'border.subtle',
        borderRadius: 0,
        background: 'transparent',
        color: 'text.secondary',
        _hover: { background: 'bg.hover', color: 'text.primary' }
      },
      selectionTrigger: {
        width: 'selection-trigger',
        height: 'field',
        gap: '4',
        paddingInline: '5',
        background: 'bg.raised',
        color: 'text.primary',
        _disabled: { opacity: 'muted' },
        '&:hover:not(:disabled)': { background: 'bg.control' }
      },
      selectionOption: {
        width: '100%',
        minHeight: 'menu-row-min',
        justifyContent: 'flex-start',
        padding: '4',
        borderRadius: 'compact',
        background: 'transparent',
        color: 'text.primary',
        _disabled: { opacity: 'full' },
        _hover: { background: 'border.subtle' }
      }
    },
    size: {
      compact: { minHeight: 'button-compact' },
      small: { minHeight: 'button-small' },
      medium: { minHeight: 'button-medium' },
      large: { minHeight: 'button-large' }
    },
    shape: {
      rounded: { borderRadius: 'default' },
      control: { borderRadius: 'control' },
      pill: { borderRadius: 'pill' }
    },
    content: {
      label: {},
      icon: { flex: 'none', gap: 0, padding: 0 }
    },
    tone: {
      neutral: {},
      accent: {
        '&:hover:not(:disabled)': { color: 'action.primary' },
        _focusVisible: { color: 'action.primary' }
      }
    },
    highlighted: {
      true: { background: 'border.subtle' },
      false: {}
    },
    placeholder: {
      true: { color: 'text.muted' },
      false: {}
    },
    pressed: {
      true: { background: 'action.primary.subtle', color: 'action.primary' },
      false: {}
    },
    selected: {
      true: { background: 'action.primary.subtle', color: 'action.primary' },
      false: {}
    }
  },
  compoundVariants: [
    {
      content: 'icon',
      size: 'compact',
      css: { width: 'button-compact', height: 'button-compact', minHeight: 'button-compact' }
    },
    {
      content: 'icon',
      size: 'small',
      css: { width: 'icon-button-small', height: 'icon-button-small', minHeight: 'icon-button-small' }
    },
    {
      content: 'icon',
      size: 'medium',
      css: { width: 'icon-button-medium', height: 'icon-button-medium', minHeight: 'icon-button-medium' }
    }
  ],
  defaultVariants: {
    appearance: 'ghost',
    content: 'label',
    highlighted: false,
    placeholder: false,
    pressed: false,
    selected: false,
    shape: 'rounded',
    size: 'medium',
    tone: 'neutral'
  }
})

export type ButtonProps = RecipeVariantProps<typeof buttonRecipe> & {
  activeDescendant?: string
  ariaSelected?: boolean
  children: ReactNode
  controls?: string
  disabled?: boolean
  elementRole?: 'option' | 'tab'
  expanded?: boolean
  hasPopup?: 'dialog' | 'listbox' | 'menu'
  id?: string
  label?: string
  onPointerEnter?: () => void
  onPress?: () => void
  tabIndex?: -1 | 0
  title?: string
  type?: 'button' | 'reset' | 'submit'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    appearance,
    activeDescendant,
    ariaSelected,
    children,
    controls,
    content,
    disabled,
    elementRole,
    expanded,
    hasPopup,
    highlighted,
    id,
    label,
    onPress,
    onPointerEnter,
    placeholder,
    pressed,
    selected,
    shape,
    size,
    tabIndex,
    title,
    tone,
    type = 'button'
  },
  ref
) {
  return (
    <button
      aria-controls={controls}
      aria-activedescendant={activeDescendant}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      aria-label={label}
      aria-pressed={pressed === null ? undefined : pressed}
      aria-selected={ariaSelected ?? (selected === null ? undefined : selected)}
      className={buttonRecipe({ appearance, content, highlighted, placeholder, pressed, selected, shape, size, tone })}
      disabled={disabled}
      id={id}
      onClick={onPress}
      onMouseEnter={onPointerEnter}
      ref={ref}
      role={elementRole}
      tabIndex={tabIndex}
      title={title}
      type={type}
    >
      {children}
    </button>
  )
})
