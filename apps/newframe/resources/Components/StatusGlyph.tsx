import { Icon } from '@newframe/ui/icon'
import { Spinner } from '@newframe/ui/spinner'

import { cva } from '../styled-system/css/cva.js'

export type StatusGlyphState = 'pending' | 'completed' | 'failed' | 'idle'

type StatusGlyphProps = {
  state: StatusGlyphState
  size?: 'small' | 'medium'
}

const glyphRecipe = cva({
  base: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    borderRadius: 'pill'
  },
  variants: {
    state: {
      pending: { background: 'bg.primary', color: 'action.primary' },
      completed: { background: 'action.primary', color: 'action.primary.text' },
      failed: { background: 'status.danger', color: 'text.inverse' },
      idle: { background: 'bg.control', color: 'text.muted' }
    },
    size: {
      small: { width: 'icon-medium', height: 'icon-medium' },
      medium: { width: 'progress-marker', height: 'progress-marker' }
    }
  },
  defaultVariants: { size: 'medium', state: 'idle' }
})

const dotRecipe = cva({
  base: {
    width: 'status-dot-small',
    height: 'status-dot-small',
    borderRadius: 'pill',
    background: 'currentColor'
  }
})

const StatusGlyph = ({ state, size = 'medium' }: StatusGlyphProps) => {
  const iconSize = size === 'small' ? 'small' : 'medium'

  if (state === 'pending') {
    return (
      <span aria-hidden='true' className={glyphRecipe({ size, state })}>
        <Spinner label='Pending' size='small' />
      </span>
    )
  }

  if (state === 'completed') {
    return (
      <span aria-hidden='true' className={glyphRecipe({ size, state })}>
        <Icon name='check' size={iconSize} />
      </span>
    )
  }

  if (state === 'failed') {
    return (
      <span aria-hidden='true' className={glyphRecipe({ size, state })}>
        <Icon name='close' size={iconSize} />
      </span>
    )
  }

  return (
    <span aria-hidden='true' className={glyphRecipe({ size, state })}>
      <span className={dotRecipe()} />
    </span>
  )
}

export default StatusGlyph
