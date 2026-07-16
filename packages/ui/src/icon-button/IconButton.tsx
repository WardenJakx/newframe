import { cva, type VariantProps } from 'class-variance-authority'
import type { MouseEvent } from 'react'

import { Icon, type IconName } from '../icon/Icon.js'
import './icon-button.css'

const iconButtonRecipe = cva('nf-icon-button', {
  variants: {
    appearance: {
      ghost: 'nf-icon-button--ghost',
      menu: 'nf-icon-button--menu',
      control: 'nf-icon-button--control'
    },
    size: {
      small: 'nf-icon-button--small',
      medium: 'nf-icon-button--medium'
    },
    tone: {
      neutral: 'nf-icon-button--neutral',
      accent: 'nf-icon-button--accent'
    }
  },
  defaultVariants: { appearance: 'ghost', size: 'medium', tone: 'neutral' }
})

export type IconButtonProps = VariantProps<typeof iconButtonRecipe> & {
  expanded?: boolean
  icon: IconName
  label: string
  onPress: () => void
  title?: string
}

export function IconButton({
  appearance,
  expanded,
  icon,
  label,
  onPress,
  size,
  title,
  tone
}: IconButtonProps) {
  return (
    <button
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-label={label}
      className={iconButtonRecipe({ appearance, size, tone })}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onPress()
      }}
      title={title}
      type='button'
    >
      <Icon name={icon} size={size === 'small' ? 'small' : 'medium'} />
    </button>
  )
}
