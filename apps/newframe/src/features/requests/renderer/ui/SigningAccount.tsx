import { Inline } from '@newframe/ui/inline'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import type { ReactNode } from 'react'

export function SigningAccount({
  children,
  label = 'Signing with'
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <Surface padding='small' radius='card' tone='card'>
      <Inline align='center' gap='small' justify='between'>
        <Text tone='secondary' variant='overline'>
          {label}
        </Text>
        <Inline align='center' gap='xsmall'>
          {children}
        </Inline>
      </Inline>
    </Surface>
  )
}
