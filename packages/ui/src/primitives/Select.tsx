import { forwardRef } from 'react'

import { inputClasses } from './Input.js'

export type SelectOption = { disabled?: boolean; label: string; value: string }

export type SelectProps = {
  defaultValue?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
  label: string
  name?: string
  onValueChange?: (value: string) => void
  options: readonly SelectOption[]
  required?: boolean
  value?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { defaultValue, disabled, id, invalid = false, label, name, onValueChange, options, required, value },
  ref
) {
  return (
    <select
      aria-invalid={invalid || undefined}
      aria-label={label}
      aria-required={required || undefined}
      className={inputClasses({ appearance: 'control', invalid })}
      defaultValue={defaultValue}
      disabled={disabled}
      id={id}
      name={name}
      onChange={onValueChange ? (event) => onValueChange(event.currentTarget.value) : undefined}
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
