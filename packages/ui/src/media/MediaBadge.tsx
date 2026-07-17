import type { ReactNode } from 'react'

import './media.css'

export type MediaBadgeProps = {
  badge: ReactNode
  children: ReactNode
  decorative?: boolean
  size?: 'small' | 'medium'
}

export function MediaBadge({ badge, children, decorative = false, size = 'medium' }: MediaBadgeProps) {
  return (
    <span aria-hidden={decorative || undefined} className={`nf-media-badge nf-media-badge--${size}`}>
      <span className='nf-media-badge__media'>{children}</span>
      <span className='nf-media-badge__badge'>{badge}</span>
    </span>
  )
}
