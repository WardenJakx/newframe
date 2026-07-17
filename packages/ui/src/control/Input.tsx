import { forwardRef, type ChangeEventHandler, type HTMLInputAutoCompleteAttribute } from 'react'

import './input.css'
import '../typography/text.css'
import { inputRecipe, type InputRecipeProps } from './inputRecipe.js'

export type InputProps = InputRecipeProps & {
  autoComplete?: HTMLInputAutoCompleteAttribute
  defaultValue?: string | number
  describedBy?: string
  disabled?: boolean
  id?: string
  inputMode?: 'decimal' | 'email' | 'none' | 'numeric' | 'search' | 'tel' | 'text' | 'url'
  label?: string
  max?: string | number
  min?: string | number
  name?: string
  onChange?: ChangeEventHandler<HTMLInputElement>
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
    defaultValue,
    describedBy,
    disabled,
    id,
    inputMode,
    invalid = false,
    label,
    max,
    min,
    name,
    onChange,
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
      aria-required={required || undefined}
      autoComplete={autoComplete}
      className={inputRecipe({ align, appearance, invalid })}
      defaultValue={defaultValue}
      disabled={disabled}
      id={id}
      inputMode={inputMode}
      max={max}
      min={min}
      name={name}
      onChange={onChange}
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
