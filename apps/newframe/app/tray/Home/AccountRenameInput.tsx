import { useEffect, useRef, useState } from 'react'

import svg from '../../../resources/svg'

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
    <div className='t2AccountRenameInput'>
      <input
        aria-label={ariaLabel}
        ref={inputRef}
        spellCheck='false'
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
      <div
        aria-label='Cancel rename'
        className='t2AccountRenameCancel'
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onCancel()
          }
        }}
        role='button'
        tabIndex={0}
      >
        {svg.x(12)}
      </div>
    </div>
  )
}
