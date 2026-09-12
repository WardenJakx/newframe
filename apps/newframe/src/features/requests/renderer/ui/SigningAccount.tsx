import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import type { ReactNode } from 'react'

export function SigningAccount({ children }: { children: ReactNode }) {
  return (
    <Surface padding='small' radius='card' tone='card'>
      <Inline align='center' gap='small' justify='between'>
        <Text tone='secondary' variant='overline'>
          Signing with
        </Text>
        <Inline align='center' gap='xsmall'>
          <Icon name='wallet' size='small' tone='accent' />
          {children}
        </Inline>
      </Inline>
    </Surface>
  )
}
