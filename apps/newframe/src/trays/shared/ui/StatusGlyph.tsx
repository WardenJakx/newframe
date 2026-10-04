import { Icon } from '@newframe/ui/icon'
import { Spinner } from '@newframe/ui/spinner'

import { cva } from '../../../../generated/styled-system/css/cva.js'

type StatusGlyphState = 'pending' | 'completed' | 'failed' | 'idle'

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
      completed: { background: 'status.success', color: 'text.inverse' },
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
  let content = <span className={dotRecipe()} />
  if (state === 'pending') {
    content = <Spinner label='Pending' size='small' />
  } else if (state !== 'idle') {
    content = <Icon name={state === 'completed' ? 'check' : 'close'} size={iconSize} />
  }

  return (
    <span aria-hidden='true' className={glyphRecipe({ size, state })} data-status-glyph={state}>
      {content}
    </span>
  )
}

export default StatusGlyph
