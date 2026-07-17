import type { ReactNode } from 'react'

export type GroupProps = {
  children: ReactNode
  label: string
}

export function Group({ children, label }: GroupProps) {
  return (
    <div aria-label={label} role='group'>
      {children}
    </div>
  )
}
