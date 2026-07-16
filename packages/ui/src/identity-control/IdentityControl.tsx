import type { IconName } from '../icon/Icon.js'
import { Icon } from '../icon/Icon.js'
import { IconButton } from '../icon-button/IconButton.js'
import { Text } from '../typography/Text.js'
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
        <span className='nf-identity-control__icon'>
          <Icon name={icon} size='medium' />
        </span>
        <span className='nf-identity-control__text'>
          <Text role='body' truncate>
            {name}
          </Text>
          {detail ? (
            <Text role='code' tone='muted'>
              {detail}
            </Text>
          ) : null}
        </span>
        <span className='nf-identity-control__chevron'>
          <Icon name='chevronUp' size='medium' />
        </span>
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
