import type { CSSProperties } from 'react'

import { cva } from '../styled-system/css/cva.js'

const chainDotRecipe = cva({
  base: { display: 'block', flexShrink: 0, borderRadius: '50%', background: 'var(--chain-dot-color)' },
  variants: {
    size: {
      small: { width: 'status-dot-small', height: 'status-dot-small' },
      medium: { width: 'status-dot-medium', height: 'status-dot-medium' }
    }
  },
  defaultVariants: { size: 'small' }
})

export type ChainDotProps = {
  color: string
  size?: 'medium' | 'small'
}

export function ChainDot({ color, size = 'small' }: ChainDotProps) {
  return (
    <span
      aria-hidden='true'
      className={chainDotRecipe({ size })}
      style={{ '--chain-dot-color': color } as CSSProperties}
    />
  )
}
