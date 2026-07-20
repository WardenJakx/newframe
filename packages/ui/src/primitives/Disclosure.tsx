import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import { Button } from './Button.js'
import { Icon, type IconName } from './Icon.js'
import { Stack } from './Stack.js'
import { Surface } from './Surface.js'
import { Text } from './Text.js'

const chevronRecipe = cva({
  base: { marginInlineStart: 'auto', display: 'flex' },
  variants: {
    open: {
      true: { transform: 'none' },
      false: { transform: 'rotate(token(sizes.motion-rotation-half))' }
    }
  },
  defaultVariants: { open: false }
})

export type DisclosureProps = {
  children: ReactNode
  icon?: IconName
  label: string
  onToggle: () => void
  open: boolean
}

export function Disclosure({ children, icon, label, onToggle, open }: DisclosureProps) {
  return (
    <Stack element='section' gap='small'>
      <Button appearance='disclosure' expanded={open} onPress={onToggle} size='medium'>
        {icon ? <Icon name={icon} size='small' /> : null}
        <Text variant='action' tone='secondary'>
          {label}
        </Text>
        <span aria-hidden='true' className={chevronRecipe({ open })}>
          <Icon name='chevronUp' size='small' />
        </span>
      </Button>
      {open ? (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          {children}
        </Surface>
      ) : null}
    </Stack>
  )
}
