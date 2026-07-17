import { cva, type VariantProps } from 'class-variance-authority'

import { Icon, type IconName } from '../icon/Icon.js'
import { Text } from '../typography/Text.js'
import './menu.css'

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
            <Text display='inline' role='detail' tone={badgeActive ? 'accent' : 'muted'}>
              {badge}
            </Text>
          </span>
        ) : (
          <Icon name='arrowRight' size='small' />
        )}
      </span>
    </button>
  )
}
