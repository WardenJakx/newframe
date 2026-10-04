import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { StatusDot } from '@newframe/ui/status-dot'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useId } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import type { TorStatus } from '../../../../../platform/internet/contract/status.ts'

const indicatorRecipe = cva({
  base: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'flex-end',
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
    label: 'Tor',
    title: 'Traffic proxied via Tor',
    detail: 'Remote requests use Tor. Local connections stay direct.',
    appearance: 'tor',
    tone: 'primary'
  },
  connecting: {
    label: 'Tor…',
    title: 'Connecting to Tor',
    detail: 'Remote traffic waits for Tor. You can turn it off in Settings.',
    appearance: 'control',
    tone: 'warning'
  },
  error: {
    label: 'Tor offline',
    title: 'Tor is unavailable',
    detail: 'Remote traffic is blocked. Restart or turn Tor off in Settings.',
    appearance: 'danger',
    tone: 'danger'
  },
  direct: {
    label: 'Tor disabled',
    title: 'Tor disabled',
    detail: 'Remote requests connect directly. Enable Tor in Settings.',
    appearance: 'control',
    tone: 'muted'
  }
} as const

export function TorIndicator({ status, onOpenSettings }: { status: TorStatus; onOpenSettings: () => void }) {
  const tooltipId = useId()
  const display = presentation[status.connection]
  return (
    <div aria-live='polite' className={indicatorRecipe()}>
      <Button
        appearance={display.appearance}
        description={tooltipId}
        label={display.title}
        onPress={onOpenSettings}
        shape='pill'
        size='small'
      >
        <Inline align='center' gap='xsmall'>
          {status.connection === 'connecting' ? (
            <StatusDot size='small' tone='warning' />
          ) : (
            <Icon
              name={status.connection === 'connected' ? 'lock' : 'unlock'}
              size='small'
              tone={display.tone}
            />
          )}
          <Text tone={display.tone} variant='micro'>
            {display.label}
          </Text>
        </Inline>
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
