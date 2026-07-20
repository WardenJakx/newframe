import { cva } from '../styled-system/css/cva.js'

const spinnerRecipe = cva({
  base: {
    display: 'inline-block',
    borderWidth: 'strong',
    borderStyle: 'solid',
    borderColor: 'action.primary.subtle',
    borderBlockStartColor: 'action.primary',
    borderRadius: 'pill',
    animationName: 'spin',
    animationDuration: 'standard',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear'
  },
  variants: {
    size: {
      small: { width: 'icon-small', height: 'icon-small' },
      medium: { width: 'icon-medium', height: 'icon-medium' },
      large: { width: 'icon-large', height: 'icon-large' }
    }
  },
  defaultVariants: { size: 'medium' }
})

export type SpinnerProps = {
  label: string
  size?: 'large' | 'medium' | 'small'
}

export function Spinner({ label, size }: SpinnerProps) {
  return <span aria-label={label} className={spinnerRecipe({ size })} role='status' />
}
