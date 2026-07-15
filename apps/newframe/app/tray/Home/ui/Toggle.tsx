import React from 'react'

import { activateOnKeyboard } from './keyboard'

export interface ToggleProps {
  label?: string
  on: boolean
  onToggle: () => void
}

export function Toggle({ label, on, onToggle }: ToggleProps) {
  return (
    <div
      aria-checked={on}
      aria-label={label}
      className={on ? 't2Toggle t2ToggleOn' : 't2Toggle'}
      onClick={onToggle}
      onKeyDown={(event) => activateOnKeyboard(event, onToggle)}
      role='switch'
      tabIndex={0}
    >
      <div className='t2ToggleKnob' />
    </div>
  )
}
