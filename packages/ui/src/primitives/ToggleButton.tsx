import type { ReactNode } from 'react'

import { Button, type ButtonProps } from './Button.js'

export type ToggleButtonProps = Pick<ButtonProps, 'disabled' | 'label' | 'pressed' | 'size'> & {
  appearance?: 'row' | 'segment' | 'switch' | null
  children?: ReactNode
  onPress: () => void
}

export function ToggleButton({
  appearance,
  children,
  disabled,
  label,
  onPress,
  pressed,
  size
}: ToggleButtonProps) {
  return (
    <Button
      appearance={appearance === 'row' ? 'row' : appearance === 'switch' ? 'switch' : 'segment'}
      checked={appearance === 'switch' ? (pressed ?? false) : undefined}
      disabled={disabled}
      label={label}
      elementRole={appearance === 'switch' ? 'switch' : undefined}
      onPress={onPress}
      pressed={pressed ?? false}
      shape='rounded'
      size={size}
    >
      {children}
    </Button>
  )
}
