import React, { useState } from 'react'

import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

interface ConfirmDialogProps {
  prompt: React.ReactNode
  acceptText?: string
  declineText?: string
  onAccept: () => void
  onDecline: () => void
}

export default function ConfirmDialog({
  prompt,
  acceptText = 'OK',
  declineText = 'Decline',
  onAccept,
  onDecline
}: ConfirmDialogProps) {
  const [submitted, setSubmitted] = useState(false)

  const submit = (onClick: () => void) => {
    if (!submitted) {
      setSubmitted(true)
      onClick()
    }
  }

  return (
    <Dialog label='Confirmation' width='compact'>
      <Stack gap='medium'>
        <Text align='center' as='h2' variant='sectionTitle'>
          {prompt}
        </Text>
        <Stack direction='row' gap='small' justify='center'>
          <Button appearance='control' disabled={submitted} onPress={() => submit(onDecline)} shape='pill'>
            <Text variant='compactAction'>{declineText}</Text>
          </Button>
          <Button appearance='primary' disabled={submitted} onPress={() => submit(onAccept)} shape='pill'>
            <Text variant='compactAction'>{acceptText}</Text>
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}
