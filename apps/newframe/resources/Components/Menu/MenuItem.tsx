import { Button } from '@newframe/ui/button'
import { Icon, type IconName } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../styled-system/css/cva.js'

const iconRecipe = cva({
  base: {
    display: 'grid',
    width: 'menu-row-icon',
    height: 'menu-row-icon',
    flex: 'none',
    placeItems: 'center',
    borderRadius: 'pill',
    background: 'bg.control'
  }
})

const badgeRecipe = cva({
  base: {
    display: 'grid',
    minWidth: '10',
    height: '10',
    placeItems: 'center',
    paddingInline: '3',
    borderRadius: 'pill',
    background: 'bg.primary'
  }
})

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
    <Button appearance='row' label={label} onPress={onPress} shape='control' size='list' width='full'>
      <Inline align='center' gap='medium' grow>
        <span className={iconRecipe()}>
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
            <span className={badgeRecipe()}>
              <Text display='inline' variant='detail' tone={badgeActive ? 'accent' : 'muted'}>
                {badge}
              </Text>
            </span>
          ) : (
            <Icon name='arrowRight' size='small' tone='muted' />
          )}
        </Inline>
      </Inline>
    </Button>
  )
}
