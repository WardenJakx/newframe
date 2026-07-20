import { forwardRef, type HTMLInputAutoCompleteAttribute } from 'react'

import { cva } from '../styled-system/css/cva.js'
import { cx } from '../styled-system/css/cx.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import { textRecipe } from './Text.js'

export const inputRecipe = cva({
  base: {
    minWidth: 0,
    width: '100%',
    height: 'input',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'transparent',
    outline: 0,
    borderRadius: 'default',
    background: 'bg.raised',
    color: 'text.primary',
    paddingInline: '4',
    _placeholder: { color: 'text.disabled' },
    _focusVisible: { borderColor: 'border.focus' }
  },
  variants: {
    appearance: {
      plain: { height: 'auto', border: 0, borderRadius: 0, background: 'transparent', padding: 0 },
      control: {},
      amount: {
        height: 'auto',
        border: 0,
        borderRadius: 0,
        background: 'transparent',
        lineHeight: 'amount',
        paddingBlock: '2',
        paddingInline: 0
      },
      numeric: {},
      code: {}
    },
    align: {
      start: { textAlign: 'left' },
      end: { textAlign: 'right' }
    },
    invalid: {
      true: { borderColor: 'status.danger', boxShadow: 'focus-danger' },
      false: {}
    }
  },
  defaultVariants: { align: 'start', appearance: 'control', invalid: false }
})

export type InputRecipeProps = RecipeVariantProps<typeof inputRecipe>

export function inputClasses(props: InputRecipeProps) {
  const appearance = props?.appearance
  const variant =
    appearance === 'amount'
      ? 'amount'
      : appearance === 'numeric'
        ? 'numeric'
        : appearance === 'code'
          ? 'code'
          : 'supporting'
  return cx(inputRecipe(props), textRecipe({ variant }))
}

export type InputProps = InputRecipeProps & {
  autoComplete?: HTMLInputAutoCompleteAttribute
  autoFocus?: boolean
  defaultValue?: string | number
  describedBy?: string
  disabled?: boolean
  id?: string
  inputMode?: 'decimal' | 'email' | 'none' | 'numeric' | 'search' | 'tel' | 'text' | 'url'
  label?: string
  labeledBy?: string
  max?: string | number
  maxLength?: number
  min?: string | number
  name?: string
  onBlur?: (value: string) => void
  onFocus?: (value: string) => void
  onSubmit?: () => void
  onValueChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  spellCheck?: boolean
  step?: string | number
  type?: 'datetime-local' | 'email' | 'number' | 'password' | 'search' | 'text'
  value?: string | number
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    align,
    appearance,
    autoComplete,
    autoFocus,
    defaultValue,
    describedBy,
    disabled,
    id,
    inputMode,
    invalid = false,
    label,
    labeledBy,
    max,
    maxLength,
    min,
    name,
    onBlur,
    onFocus,
    onSubmit,
    onValueChange,
    placeholder,
    readOnly,
    required,
    spellCheck,
    step,
    type = 'text',
    value
  },
  ref
) {
  return (
    <input
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-label={label}
      aria-labelledby={labeledBy}
      aria-required={required || undefined}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      className={inputClasses({ align, appearance, invalid })}
      defaultValue={defaultValue}
      disabled={disabled}
      id={id}
      inputMode={inputMode}
      max={max}
      maxLength={maxLength}
      min={min}
      name={name}
      onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
      onBlur={onBlur ? (event) => onBlur(event.currentTarget.value) : undefined}
      onFocus={onFocus ? (event) => onFocus(event.currentTarget.value) : undefined}
      onKeyDown={
        onSubmit
          ? (event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              onSubmit()
            }
          : undefined
      }
      placeholder={placeholder}
      readOnly={readOnly}
      ref={ref}
      required={required}
      spellCheck={spellCheck}
      step={step}
      type={type}
      value={value}
    />
  )
})
