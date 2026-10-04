import { forwardRef } from 'react'

import { cva } from '../styled-system/css/cva.js'
import { cx } from '../styled-system/css/cx.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { inputControlStyles, inputInvalidVariants } from './Input.tsx'
import { textRecipe } from './Text.tsx'

const textAreaRecipe = cva({
  base: {
    ...inputControlStyles,
    minHeight: 'field-vertical',
    resize: 'vertical',
    padding: '4'
  },
  variants: {
    invalid: inputInvalidVariants,
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
