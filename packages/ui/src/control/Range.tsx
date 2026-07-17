import type { ChangeEventHandler } from 'react'

import './range.css'

export type RangeProps = {
  label: string
  max: number
  min: number
  onChange: ChangeEventHandler<HTMLInputElement>
  step?: number
  tone?: 'accent' | 'danger' | 'special'
  value: number
}

export function Range({ label, max, min, onChange, step, tone = 'accent', value }: RangeProps) {
  return (
    <input
      aria-label={label}
      className='nf-range'
      data-tone={tone}
      max={max}
      min={min}
      onChange={onChange}
      step={step}
      type='range'
      value={value}
    />
  )
}
