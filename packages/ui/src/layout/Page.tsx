import type { ReactNode } from 'react'

import './page.css'

export type PageProps = {
  children: ReactNode
  size?: 'compact' | 'fill'
}

export function Page({ children, size = 'fill' }: PageProps) {
  return <main className={`nf-page nf-page--${size}`}>{children}</main>
}
