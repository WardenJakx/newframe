import type { ReactEventHandler } from 'react'

import './media.css'

export type ImageProps = {
  alt: string
  onError?: ReactEventHandler<HTMLImageElement>
  size?: 'fill' | 'small' | 'medium'
  source: string
}

export function Image({ alt, onError, size = 'fill', source }: ImageProps) {
  return <img alt={alt} className={`nf-image nf-image--${size}`} onError={onError} src={source} />
}
