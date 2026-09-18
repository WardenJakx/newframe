import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import StatusGlyph from '../../../../shared/renderer/ui/StatusGlyph.js'

export type RequestStatusNoticeProps = {
  notice?: string
  status?: string
}

export function RequestStatusNotice({ notice, status }: RequestStatusNoticeProps) {
  if (!notice) {
    return null
  }

  let state: 'completed' | 'failed' | 'pending' = 'pending'
  if (status === 'success' || status === 'confirmed') {
    state = 'completed'
  } else if (status === 'error' || status === 'declined') {
    state = 'failed'
  }

  return (
    <Stack align='center' gap='small' justify='center'>
      <StatusGlyph state={state} />
      <Text align='center' tone={state === 'failed' ? 'danger' : 'secondary'} variant='label'>
        {notice}
      </Text>
    </Stack>
  )
}
