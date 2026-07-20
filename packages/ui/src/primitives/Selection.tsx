import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { sva } from '../styled-system/css/sva.js'
import { Button } from './Button.js'
import { Icon } from './Icon.js'

const selectionRecipe = sva({
  slots: ['root', 'chevron', 'menu', 'header', 'list', 'empty', 'footer'],
  base: {
    root: { position: 'relative', flexShrink: 0 },
    chevron: {
      display: 'flex',
      flexShrink: 0,
      marginInlineStart: 'auto',
      color: 'text.muted',
      transform: 'rotate(token(sizes.motion-rotation-half))'
    },
    menu: {
      position: 'absolute',
      insetBlockStart: 'selection-offset',
      insetInlineStart: 0,
      zIndex: 'header',
      width: 'selection-menu',
      maxWidth: 'calc(100vw - token(sizes.field))',
      padding: '4',
      borderRadius: 'default',
      background: 'bg.hover',
      boxShadow: 'elevation-overlay'
    },
    header: { marginBlockEnd: '2' },
    list: { maxHeight: 'scroll-list', overflowY: 'auto' },
    empty: { paddingBlock: '4', paddingInline: '3' },
    footer: { marginBlockStart: '2' }
  }
})

export type SelectionItem = {
  content: ReactNode
  disabled?: boolean
  id: string
}

export type SelectionProps = {
  disabled?: boolean
  emptyContent?: ReactNode
  footer?: ReactNode
  header?: ReactNode
  items: readonly SelectionItem[]
  label: string
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  open: boolean
  placeholder?: boolean
  selectedId?: string
  trigger: ReactNode
}

export function Selection({
  disabled = false,
  emptyContent,
  footer,
  header,
  items,
  label,
  onOpenChange,
  onSelect,
  open,
  placeholder = false,
  selectedId,
  trigger
}: SelectionProps) {
  const styles = selectionRecipe()
  const root = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const selectedIndex = items.findIndex((item) => item.id === selectedId && !item.disabled)
  const firstEnabledIndex = items.findIndex((item) => !item.disabled)
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0)
  const enabled = firstEnabledIndex >= 0
  const canOpen = enabled || !!header

  useEffect(() => {
    if (!open) return
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex)
  }, [firstEnabledIndex, open, selectedIndex])

  useEffect(() => {
    if (!open) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (root.current?.contains(event.target as Node)) return
      onOpenChange(false)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [onOpenChange, open])

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && (!canOpen || disabled)) return
      onOpenChange(nextOpen)
    },
    [canOpen, disabled, onOpenChange]
  )

  const select = useCallback(
    (id: string) => {
      onSelect(id)
      onOpenChange(false)
    },
    [onOpenChange, onSelect]
  )

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (!enabled) return

      setHighlightedIndex((current) => {
        let next = current
        for (let index = 0; index < items.length; index += 1) {
          next = (next + direction + items.length) % items.length
          if (!items[next]?.disabled) return next
        }
        return current
      })
    },
    [enabled, items]
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const fromTextInput = ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      onOpenChange(false)
      return
    }

    if (fromTextInput && !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return

    if (!enabled || disabled) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        onOpenChange(true)
        return
      }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        onOpenChange(true)
        return
      }
      const highlighted = items[highlightedIndex]
      if (highlighted && !highlighted.disabled) select(highlighted.id)
    }
  }

  const activeOption = open ? items[highlightedIndex] : undefined
  const activeOptionId = activeOption ? `${listboxId}-${activeOption.id}` : undefined

  return (
    <div className={styles.root} onKeyDown={handleKeyDown} ref={root}>
      <Button
        activeDescendant={activeOptionId}
        appearance='selectionTrigger'
        controls={open ? listboxId : undefined}
        disabled={disabled || !canOpen}
        expanded={open}
        hasPopup='listbox'
        label={label}
        onPress={() => setOpen(!open)}
        placeholder={placeholder}
      >
        {trigger}
        <span aria-hidden='true' className={styles.chevron}>
          <Icon name='chevronUp' size='small' />
        </span>
      </Button>
      {open && canOpen ? (
        <div className={styles.menu}>
          {header ? <div className={styles.header}>{header}</div> : null}
          <div aria-label={label} className={styles.list} id={listboxId} role='listbox'>
            {items.length ? (
              items.map((item, index) => (
                <Button
                  appearance='selectionOption'
                  ariaSelected={item.id === selectedId}
                  disabled={item.disabled}
                  elementRole='option'
                  highlighted={index === highlightedIndex}
                  id={`${listboxId}-${item.id}`}
                  key={item.id}
                  onPointerEnter={() => setHighlightedIndex(index)}
                  onPress={() => select(item.id)}
                  tabIndex={-1}
                >
                  {item.content}
                </Button>
              ))
            ) : emptyContent ? (
              <div className={styles.empty}>{emptyContent}</div>
            ) : null}
          </div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      ) : null}
    </div>
  )
}
