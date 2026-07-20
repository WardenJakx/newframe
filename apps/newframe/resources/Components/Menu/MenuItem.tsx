import { Icon, type IconName } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import './menu.css'

export type MenuItemProps = {
  badge?: number
  badgeActive?: boolean
  detail?: string
  icon: IconName
  label: string
  onPress: () => void
  tone?: 'danger' | 'neutral'
}

export function MenuItem({
  badge,
  badgeActive = false,
  detail,
  icon,
  label,
  onPress,
  tone = 'neutral'
}: MenuItemProps) {
  return (
    <button aria-label={label} className='nf-menu-item' onClick={onPress} type='button'>
      <Inline align='center' gap='medium' grow>
        <span className='nf-menu-item__icon'>
          <Icon name={icon} size='medium' tone={tone === 'danger' ? 'danger' : 'accent'} />
        </span>
        <Stack gap='xsmall' grow>
          <Text variant='label' tone={tone === 'danger' ? 'danger' : 'primary'}>
            {label}
          </Text>
          {detail ? (
            <Text variant='detail' tone='muted'>
              {detail}
            </Text>
          ) : null}
        </Stack>
        <Inline align='center'>
          {badge !== undefined ? (
            <span
              className={
                badgeActive ? 'nf-menu-item__badge nf-menu-item__badge--active' : 'nf-menu-item__badge'
              }
            >
              <Text display='inline' variant='detail' tone={badgeActive ? 'accent' : 'muted'}>
                {badge}
              </Text>
            </span>
          ) : (
            <Icon name='arrowRight' size='small' tone='muted' />
          )}
        </Inline>
      </Inline>
    </button>
  )
}
