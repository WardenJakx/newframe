import React from 'react'

import svg from '../svg'
import ChainTokenIcon from './ChainTokenIcon'
import TokenOptionRow from './TokenOptionRow'
import type { NetworkLike, NetworkMetaLike, TokenSelectorItem } from './tokenSelectorTypes'

interface TokenSelectorProps {
  ariaLabel: string
  footer?: React.ReactNode
  items: TokenSelectorItem[]
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  open: boolean
  selectedId: string
}

export default function TokenSelector({
  ariaLabel,
  footer,
  items,
  networks,
  networksMeta,
  onOpenChange,
  onSelect,
  open,
  selectedId
}: TokenSelectorProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const listboxId = React.useId()
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const selectedIndex = items.findIndex((item) => item.id === selectedId)
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null
  const canOpen = items.length > 0
  const invalidSelection = !!selectedId && !selectedItem
  const itemIds = React.useMemo(() => items.map((item) => item.id), [items])
  const itemIdsKey = itemIds.join('|')

  React.useEffect(() => {
    if (!invalidSelection) return

    console.warn('[TokenSelector] selectedId was not found in items', {
      selectedId,
      itemIds
    })
  }, [invalidSelection, itemIds, itemIdsKey, selectedId])

  React.useEffect(() => {
    if (!open) return

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, selectedIndex, items.length])

  React.useEffect(() => {
    if (!open) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return

      onOpenChange(false)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)

    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [onOpenChange, open])

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !canOpen) return

      onOpenChange(nextOpen)
    },
    [canOpen, onOpenChange]
  )

  const selectItem = React.useCallback(
    (id: string) => {
      onSelect(id)
      onOpenChange(false)
    },
    [onOpenChange, onSelect]
  )

  const moveHighlight = React.useCallback(
    (direction: 1 | -1) => {
      if (!items.length) return

      setHighlightedIndex((index) => (index + direction + items.length) % items.length)
    },
    [items.length]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        onOpenChange(false)
        return
      }

      if (!canOpen) return

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

        const highlightedItem = items[highlightedIndex]
        if (highlightedItem) selectItem(highlightedItem.id)
      }
    },
    [canOpen, highlightedIndex, items, moveHighlight, onOpenChange, open, selectItem]
  )

  const activeOptionId =
    open && items[highlightedIndex] ? `${listboxId}-${items[highlightedIndex].id}` : undefined
  const triggerClassName = [
    'tokenSelectorTrigger',
    selectedItem ? '' : 'tokenSelectorTriggerPlaceholder',
    canOpen ? '' : 'tokenSelectorTriggerDisabled'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className='tokenSelector' ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        aria-activedescendant={activeOptionId}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={ariaLabel}
        className={triggerClassName}
        disabled={!canOpen}
        onClick={() => setOpen(!open)}
        type='button'
      >
        {selectedItem ? (
          <ChainTokenIcon
            chainId={selectedItem.chainId}
            logoURI={selectedItem.logoURI}
            networks={networks}
            networksMeta={networksMeta}
            size='sm'
            symbol={selectedItem.symbol}
          />
        ) : null}
        <span className='tokenSelectorTriggerSymbol'>{selectedItem?.symbol || 'Select token'}</span>
        <span className='tokenSelectorChevron'>{svg.chevron(12)}</span>
      </button>
      {open && canOpen ? (
        <div className='tokenSelectorMenu'>
          <div aria-label={ariaLabel} className='tokenSelectorListbox' id={listboxId} role='listbox'>
            {items.map((item, index) => (
              <button
                aria-selected={item.id === selectedId}
                className={
                  index === highlightedIndex
                    ? 'tokenSelectorOption tokenSelectorOptionHighlighted'
                    : 'tokenSelectorOption'
                }
                id={`${listboxId}-${item.id}`}
                key={item.id}
                onClick={() => selectItem(item.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
                role='option'
                tabIndex={-1}
                type='button'
              >
                <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} />
              </button>
            ))}
          </div>
          {footer ? <div className='tokenSelectorFooter'>{footer}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
