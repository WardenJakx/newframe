import { IconButton } from '@newframe/ui/icon-button'
import { useEffect, useRef, useState } from 'react'

import type { ClipboardCapability } from '../capabilities'

export type CopyButtonProps = {
  clipboard: ClipboardCapability
  copiedLabel: string
  copiedTitle?: string
  label: string
  title?: string
  value: string
}

export function CopyButton({
  clipboard,
  copiedLabel,
  copiedTitle = 'Copied',
  label,
  title = 'Copy',
  value
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  return (
    <IconButton
      appearance='ghost'
      icon={copied ? 'check' : 'copy'}
      label={copied ? copiedLabel : label}
      onPress={(event) => {
        event.stopPropagation()
        clearTimeout(resetTimer.current)
        void clipboard.writeText(value)
        setCopied(true)
        resetTimer.current = setTimeout(() => setCopied(false), 1000)
      }}
      size='small'
      title={copied ? copiedTitle : title}
      tone={copied ? 'accent' : 'neutral'}
    />
  )
}
