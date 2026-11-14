import { css } from '../styled-system/css/css.js'

// Stretches over a `position: relative` row so the whole row is one real button while the
// row's other controls stay separate, reachable buttons. Render it before the row content.
const rowActionClass = css({
  position: 'absolute',
  inset: 0,
  padding: 0,
  border: 0,
  borderRadius: 'inherit',
  background: 'transparent',
  cursor: 'pointer',
  outline: 0,
  _focusVisible: {
    outlineWidth: 'focus',
    outlineStyle: 'solid',
    outlineColor: 'border.focus',
    outlineOffset: 'focus-outline-offset-inset'
  },
  '& ~ * :is(a, button, input, select, textarea, [draggable="true"]), & ~ :is(a, button, input, select, textarea, [draggable="true"])':
    { position: 'relative' }
})

export type RowActionProps = {
  current?: boolean
  label: string
  onPress: () => void
}

export function RowAction({ current = false, label, onPress }: RowActionProps) {
  return (
    <button
      aria-current={current || undefined}
      aria-label={label}
      className={rowActionClass}
      onClick={onPress}
      type='button'
    />
  )
}
