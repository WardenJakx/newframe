import type { ReactNode } from 'react'

import { Text } from '../typography/Text.js'
import './side-panel.css'

export type FieldProps = {
  children: ReactNode
  invalid?: boolean
  label: string
  required?: boolean
  suffix?: string
  vertical?: boolean
}

export function Field({
  children,
  invalid = false,
  label,
  required = false,
  suffix,
  vertical = false
}: FieldProps) {
  return (
    <label
      className={`nf-field${invalid ? ' nf-field--invalid' : ''}${vertical ? ' nf-field--vertical' : ''}`}
      data-invalid={invalid || undefined}
    >
      <Text display='inline' role='fieldLabel' tone='secondary'>
        {label}
        {required ? (
          <Text decorative display='inline' role='fieldLabel' tone='danger'>
            {' *'}
          </Text>
        ) : null}
      </Text>
      <span className='nf-field__control'>
        {children}
        {suffix ? (
          <Text display='inline' role='caption' tone='disabled'>
            {suffix}
          </Text>
        ) : null}
      </span>
    </label>
  )
}
