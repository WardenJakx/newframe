import { IconButton } from '@newframe/ui/icon-button'
import { useEffect, useRef, useState } from 'react'

import link from '../../../platform/ipc/renderer/link'

export type CopyButtonProps = {
  copiedLabel: string
  copiedTitle?: string
  label: string
  onCopy?: (value: string) => void
  title?: string
  value: string
}

export function CopyButton({
  copiedLabel,
  copiedTitle = 'Copied',
  label,
  onCopy,
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
        if (onCopy) {
          onCopy(value)
        } else {
          void link.executeCommand({ type: 'clipboard.write', text: value })
        }
        setCopied(true)
        resetTimer.current = setTimeout(() => setCopied(false), 1000)
      }}
      size='small'
      title={copied ? copiedTitle : title}
      tone={copied ? 'accent' : 'neutral'}
    />
  )
}
