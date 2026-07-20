import { Button } from '@newframe/ui/button'
import { Icon, type IconName } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../styled-system/css/cva.js'

const identityControlRecipe = cva({
  base: {
    width: '100%',
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    maxWidth: 'selection-menu',
    gap: '2',
    padding: '3',
    overflow: 'hidden',
    borderRadius: 'pill',
    background: 'bg.raised',
    _hover: { background: 'bg.hover' }
  }
})

const identityIconRecipe = cva({
  base: {
    display: 'grid',
    width: 'identity-icon',
    height: 'identity-icon',
    flex: 'none',
    placeItems: 'center',
    borderRadius: 'pill',
    color: 'action.primary',
    background: 'bg.control'
  }
})

export type IdentityControlAction = {
  icon: IconName
  label: string
  onPress: () => void
  title?: string
}

export type IdentityControlProps = {
  actions?: readonly IdentityControlAction[]
  detail?: string
  expanded: boolean
  icon: IconName
  label: string
  name: string
  onPress: () => void
}

export function IdentityControl({
  actions = [],
  detail,
  expanded,
  icon,
  label,
  name,
  onPress
}: IdentityControlProps) {
  return (
    <div className={identityControlRecipe()}>
      <Button
        appearance='ghost'
        expanded={expanded}
        hasPopup='dialog'
        label={label}
        onPress={onPress}
        width='full'
      >
        <Inline align='center' gap='small' grow>
          <span className={identityIconRecipe()}>
            <Icon name={icon} size='medium' />
          </span>
          <Stack gap='none' grow>
            <Text variant='body' truncate>
              {name}
            </Text>
            {detail ? (
              <Text variant='code' tone='muted'>
                {detail}
              </Text>
            ) : null}
          </Stack>
          <Icon name='chevronUp' size='medium' tone='muted' />
        </Inline>
      </Button>
      {actions.length > 0 ? (
        <Inline align='center' gap='none'>
          {actions.map((action) => (
            <IconButton
              appearance='ghost'
              icon={action.icon}
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              size='small'
              title={action.title}
              tone='accent'
            />
          ))}
        </Inline>
      ) : null}
    </div>
  )
}
