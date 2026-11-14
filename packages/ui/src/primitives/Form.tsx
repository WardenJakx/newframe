import type { ReactNode } from 'react'

import { css } from '../styled-system/css/css.js'

// Layout stays with the children; the form only adds native submit semantics
// (Enter submits, IME-safe; a type='submit' Button submits).
const formClass = css({ display: 'contents' })

export type FormProps = {
  children: ReactNode
  label?: string
  onSubmit: () => void
}

export function Form({ children, label, onSubmit }: FormProps) {
  return (
    <form
      aria-label={label}
      className={formClass}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}
