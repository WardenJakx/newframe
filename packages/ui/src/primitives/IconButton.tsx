import { Button, type ButtonProps } from './Button.js'
import { Icon, type IconName } from './Icon.js'

export type IconButtonProps = Pick<ButtonProps, 'expanded' | 'size' | 'title'> & {
  appearance?: 'control' | 'ghost' | 'menu' | 'subtle'
  icon: IconName
  label: string
  onPress: () => void
  tone?: 'accent' | 'neutral'
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
  const resolvedSize = size ?? 'medium'

  return (
    <Button
      appearance={appearance}
      content='icon'
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
