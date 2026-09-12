import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { useEffect, useRef, useState } from 'react'

interface AccountRenameInputProps {
  ariaLabel: string
  initialName: string
  onCancel: () => void
  onCommit: (name: string) => void
}

export default function AccountRenameInput({
  ariaLabel,
  initialName,
  onCancel,
  onCommit
}: AccountRenameInputProps) {
  const [draft, setDraft] = useState(initialName)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const name = draft.trim()
    if (name) onCommit(name)
    else onCancel()
  }

  return (
    <Stack align='center' direction='row' gap='xsmall'>
      <Input
        appearance='plain'
        label={ariaLabel}
        onCancel={onCancel}
        onSubmit={commit}
        onValueChange={setDraft}
        ref={inputRef}
        spellCheck={false}
        value={draft}
      />
      <IconButton
        icon='close'
        label='Cancel rename'
        onPress={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }}
        size='small'
      />
    </Stack>
  )
}
