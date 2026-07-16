import { cva, type VariantProps } from 'class-variance-authority'
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { Icon, type IconName } from '../icon/Icon.js'
import { IconButton } from '../icon-button/IconButton.js'
import { Text } from '../typography/Text.js'
import './menu.css'

export type MenuOverlayProps = {
  children: ReactNode
  closeLabel: string
  label: string
  onClose: () => void
  title: string
}

export function MenuOverlay({ children, closeLabel, label, onClose, title }: MenuOverlayProps) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const overlay = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    overlay.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      aria-label={label}
      aria-modal='true'
      className='nf-menu-overlay'
      onKeyDown={onKeyDown}
      ref={overlay}
      role='dialog'
    >
      <div className='nf-menu-overlay__header'>
        <span aria-hidden='true' className='nf-menu-overlay__spacer' />
        <span className='nf-menu-overlay__title'>
          <Text role='title'>{title}</Text>
        </span>
        <IconButton appearance='control' icon='close' label={closeLabel} onPress={onClose} />
      </div>
      <div className='nf-menu-overlay__scroll'>{children}</div>
    </div>
  )
}

const menuItemRecipe = cva('nf-menu-item', {
  variants: {
    tone: {
      neutral: 'nf-menu-item--neutral',
      danger: 'nf-menu-item--danger'
    }
  },
  defaultVariants: { tone: 'neutral' }
})

export type MenuItemProps = VariantProps<typeof menuItemRecipe> & {
  badge?: number
  badgeActive?: boolean
  detail?: string
  icon: IconName
  label: string
  onPress: () => void
}

export function MenuItem({ badge, badgeActive = false, detail, icon, label, onPress, tone }: MenuItemProps) {
  return (
    <button aria-label={label} className={menuItemRecipe({ tone })} onClick={onPress} type='button'>
      <span className='nf-menu-item__icon'>
        <Icon name={icon} size='medium' />
      </span>
      <span className='nf-menu-item__text'>
        <Text role='label' tone={tone === 'danger' ? 'danger' : 'primary'}>
          {label}
        </Text>
        {detail ? (
          <Text role='detail' tone='muted'>
            {detail}
          </Text>
        ) : null}
      </span>
      <span className='nf-menu-item__right'>
        {badge !== undefined ? (
          <span
            className={
              badgeActive ? 'nf-menu-item__badge nf-menu-item__badge--active' : 'nf-menu-item__badge'
            }
          >
            {badge}
          </span>
        ) : (
          <Icon name='arrowRight' size='small' />
        )}
      </span>
    </button>
  )
}
