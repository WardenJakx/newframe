import { forwardRef } from 'react'

import { cva } from '../styled-system/css/cva.js'
import { cx } from '../styled-system/css/cx.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { textRecipe } from './Text.js'

const textAreaRecipe = cva({
  base: {
    minWidth: 0,
    width: '100%',
    minHeight: 'field-vertical',
    resize: 'vertical',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'transparent',
    outline: 0,
    borderRadius: 'default',
    background: 'bg.raised',
    color: 'text.primary',
    padding: '4',
    _placeholder: { color: 'text.disabled' },
    _focusVisible: { borderColor: 'border.focus' }
  },
  variants: {
    invalid: {
      true: { borderColor: 'status.danger', boxShadow: 'focus-danger' },
      false: {}
    },
    code: {
      true: {},
      false: {}
    }
  },
  defaultVariants: { code: false, invalid: false }
})

export type TextAreaProps = RecipeVariantProps<typeof textAreaRecipe> & {
  autoFocus?: boolean
  label: string
  maxLength?: number
  onValueChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  rows?: number
  spellCheck?: boolean
  value: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    autoFocus,
    code = false,
    invalid = false,
    label,
    maxLength,
    onValueChange,
    placeholder,
    readOnly,
    rows,
    spellCheck,
    value
  },
  ref
) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      aria-label={label}
      autoFocus={autoFocus}
      className={cx(textAreaRecipe({ code, invalid }), textRecipe({ variant: code ? 'code' : 'body' }))}
      maxLength={maxLength}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      ref={ref}
      rows={rows}
      spellCheck={spellCheck}
      value={value}
    />
  )
})
