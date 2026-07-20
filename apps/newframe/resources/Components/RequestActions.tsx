import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import type { ReactNode } from 'react'

export type RequestAction = {
  disabled?: boolean
  label: string
  onPress: () => void
}

export type RequestActionsProps = {
  primary: RequestAction
  secondary: RequestAction
  primaryContent?: ReactNode
}

export function RequestActions({ primary, primaryContent, secondary }: RequestActionsProps) {
  return (
    <Surface border='subtle' elevation='default' padding='small' radius='card' tone='raised'>
      <Stack direction='row' equal gap='small'>
        <Button
          appearance='danger'
          disabled={secondary.disabled}
          onPress={secondary.onPress}
          size='large'
          width='full'
        >
          <Text variant='action'>{secondary.label}</Text>
        </Button>
        <Button
          appearance='primary'
          disabled={primary.disabled}
          onPress={primary.onPress}
          size='large'
          width='full'
        >
          {primaryContent ?? <Text variant='action'>{primary.label}</Text>}
        </Button>
      </Stack>
    </Surface>
  )
}
