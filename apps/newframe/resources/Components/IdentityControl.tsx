import { Icon, type IconName } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import './identity-control.css'

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
    <div className='nf-identity-control'>
      <button
        aria-expanded={expanded}
        aria-haspopup='dialog'
        aria-label={label}
        className='nf-identity-control__identity'
        onClick={onPress}
        type='button'
      >
        <Inline align='center' gap='small' grow>
          <span className='nf-identity-control__icon'>
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
          <span className='nf-identity-control__chevron'>
            <Icon name='chevronUp' size='medium' />
          </span>
        </Inline>
      </button>
      {actions.length > 0 ? (
        <span className='nf-identity-control__actions'>
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
        </span>
      ) : null}
    </div>
  )
}
