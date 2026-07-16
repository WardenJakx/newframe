import svg from '../../svg'

export type StatusGlyphState = 'pending' | 'completed' | 'failed' | 'idle'

type StatusGlyphProps = {
  state: StatusGlyphState
  className?: string
  size?: 'small' | 'medium'
}

const StatusGlyph = ({ state, className = '', size = 'medium' }: StatusGlyphProps) => {
  const classes = ['statusGlyph', `statusGlyph-${state}`, `statusGlyph-${size}`, className]
    .filter(Boolean)
    .join(' ')

  if (state === 'pending') {
    return (
      <div aria-hidden='true' className={classes}>
        <div className='statusGlyphSpinner' />
      </div>
    )
  }

  if (state === 'completed') {
    return (
      <div aria-hidden='true' className={classes}>
        {svg.check(size === 'small' ? 9 : 11)}
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div aria-hidden='true' className={classes}>
        {svg.x(size === 'small' ? 8 : 10)}
      </div>
    )
  }

  return (
    <div aria-hidden='true' className={classes}>
      <div className='statusGlyphDot' />
    </div>
  )
}

export default StatusGlyph
