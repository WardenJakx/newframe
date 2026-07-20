import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import StatusGlyph from './StatusGlyph/index.js'

export type RequestStatusNoticeProps = {
  notice?: string
  status?: string
}

export function RequestStatusNotice({ notice, status }: RequestStatusNoticeProps) {
  if (!notice) return null

  const state =
    status === 'success' || status === 'confirmed'
      ? 'completed'
      : status === 'error' || status === 'declined'
        ? 'failed'
        : 'pending'

  return (
    <Stack align='center' gap='small' justify='center'>
      <StatusGlyph state={state} />
      <Text align='center' tone={state === 'failed' ? 'danger' : 'secondary'} variant='label'>
        {notice}
      </Text>
    </Stack>
  )
}
