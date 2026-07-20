import React from 'react'

import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import useCountdown from '../Hooks/useCountdown'

const Countdown = ({ end, title }: { end: string | number | Date; title?: React.ReactNode }) => {
  const ttl = useCountdown(end)

  return (
    <Stack align='center' gap='xsmall'>
      {title ? (
        <Text align='center' tone='secondary' variant='overline'>
          {title}
        </Text>
      ) : null}
      <span role='timer'>
        <Text as='span' align='center' tone='accent' variant='label'>
          {ttl}
        </Text>
      </span>
    </Stack>
  )
}

export default Countdown
