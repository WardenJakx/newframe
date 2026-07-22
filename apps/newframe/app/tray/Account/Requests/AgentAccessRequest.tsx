import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import type { AgentAccessRequest as AgentAccessRequestData } from '../../../../main/accounts/types'

function durationLabel(seconds: number) {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? '' : 's'}`
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? '' : 's'}`
  return `${Math.ceil(seconds / 60)} minutes`
}

export default function AgentAccessRequest({ req }: { req: AgentAccessRequestData }) {
  return (
    <Surface padding='large' radius='card'>
      <Stack align='center' gap='medium'>
        <Stack align='center' gap='xsmall'>
          <Text align='center' variant='heading'>
            {req.data.descriptor.name}
          </Text>
          <Text align='center' tone='secondary' variant='supporting'>
            wants autonomous access to this AI wallet
          </Text>
        </Stack>
        {req.data.descriptor.description ? (
          <Text align='center' tone='secondary' variant='supporting'>
            {req.data.descriptor.description}
          </Text>
        ) : null}
        <Surface border='subtle' padding='small' radius='small' tone='card'>
          <Stack gap='xsmall'>
            <Text variant='label'>Session access</Text>
            <Text tone='secondary' variant='supporting'>
              Can sign messages, sign typed data, and send transactions without another prompt for{' '}
              {durationLabel(req.data.durationSeconds)}.
            </Text>
            <Text tone='secondary' variant='supporting'>
              Cannot read recovery phrases or private keys.
            </Text>
          </Stack>
        </Surface>
      </Stack>
    </Surface>
  )
}
