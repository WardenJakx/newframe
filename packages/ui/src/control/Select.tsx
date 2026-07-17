import { forwardRef, type ChangeEventHandler } from 'react'

import './input.css'
import '../typography/text.css'
import { inputRecipe } from './inputRecipe.js'

export type SelectOption = { disabled?: boolean; label: string; value: string }

export type SelectProps = {
  defaultValue?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
  label: string
  name?: string
  onChange?: ChangeEventHandler<HTMLSelectElement>
  options: readonly SelectOption[]
  required?: boolean
  value?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { defaultValue, disabled, id, invalid = false, label, name, onChange, options, required, value },
  ref
) {
  return (
    <select
      aria-invalid={invalid || undefined}
      aria-label={label}
      aria-required={required || undefined}
      className={inputRecipe({ appearance: 'control', invalid })}
      defaultValue={defaultValue}
      disabled={disabled}
      id={id}
      name={name}
      onChange={onChange}
      ref={ref}
      required={required}
      value={value}
    >
      {options.map((option) => (
        <option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
})
