import { Button, type ButtonProps } from './Button.js'
import { Icon, type IconName } from './Icon.js'

export type IconButtonProps = Pick<ButtonProps, 'disabled' | 'expanded' | 'size' | 'title'> & {
  appearance?: 'control' | 'ghost' | 'menu' | 'subtle'
  icon: IconName
  label: string
  onPress: NonNullable<ButtonProps['onPress']>
  tone?: 'accent' | 'danger' | 'neutral'
}

export function IconButton({
  appearance,
  disabled,
  expanded,
  icon,
  label,
  onPress,
  size,
  title,
  tone
}: IconButtonProps) {
  const resolvedSize = size ?? 'medium'

  return (
    <Button
      appearance={appearance}
      content='icon'
      disabled={disabled}
      expanded={expanded}
      hasPopup={expanded === undefined ? undefined : 'dialog'}
      label={label}
      onPress={onPress}
      shape={appearance === 'menu' || resolvedSize !== 'medium' ? 'pill' : 'control'}
      size={resolvedSize}
      title={title}
      tone={tone}
    >
      <Icon name={icon} size={resolvedSize === 'small' ? 'small' : 'medium'} />
    </Button>
  )
}
