import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useId } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import type { TorStatus } from '../../../../../platform/internet/contract/status.ts'

const indicatorRecipe = cva({
  base: {
    position: 'relative',
    flex: 'none',
    '& [role=tooltip]': { visibility: 'hidden', opacity: 0 },
    '&:hover [role=tooltip], &:focus-within [role=tooltip]': { visibility: 'visible', opacity: 1 }
  }
})

const tooltipRecipe = cva({
  base: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '2',
    width: 'selection-menu',
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 'overlay',
    pointerEvents: 'none'
  }
})

const presentation = {
  connected: {
    title: 'Traffic proxied via Tor',
    detail: 'Remote requests use Tor. Local connections stay direct.',
    tone: 'success'
  },
  connecting: {
    title: 'Connecting to Tor',
    detail: 'Remote traffic waits for Tor. You can turn it off in Settings.',
    tone: 'warning'
  },
  error: {
    title: 'Tor is unavailable',
    detail: 'Remote traffic is blocked. Restart or turn Tor off in Settings.',
    tone: 'danger'
  },
  direct: {
    title: 'Tor disabled',
    detail: 'Remote requests connect directly. Enable Tor in Settings.',
    tone: 'muted'
  }
} as const

export function TorIndicator({ status, onOpenSettings }: { status: TorStatus; onOpenSettings: () => void }) {
  const tooltipId = useId()
  const display = presentation[status.connection]
  return (
    <div aria-live='polite' className={indicatorRecipe()}>
      <Button
        appearance='ghost'
        content='icon'
        description={tooltipId}
        label={display.title}
        onPress={onOpenSettings}
        shape='pill'
        size='small'
      >
        <Icon name='tor' size='medium' tone={display.tone} />
      </Button>
      <div className={tooltipRecipe()} id={tooltipId} role='tooltip'>
        <Surface padding='small' radius='control' tone='raised'>
          <Stack gap='xsmall'>
            <Text variant='label'>{display.title}</Text>
            <Text tone='muted' variant='caption'>
              {display.detail}
            </Text>
          </Stack>
        </Surface>
      </div>
    </div>
  )
}
