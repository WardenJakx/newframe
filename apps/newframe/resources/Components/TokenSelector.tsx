import React from 'react'
import { Selection } from '@newframe/ui/selection'
import { SelectionChevron } from '@newframe/ui/selection-chevron'
import { SelectionFooter } from '@newframe/ui/selection-footer'
import { SelectionList } from '@newframe/ui/selection-list'
import { SelectionMenu } from '@newframe/ui/selection-menu'
import { SelectionOption } from '@newframe/ui/selection-option'
import { SelectionTrigger } from '@newframe/ui/selection-trigger'
import { Text } from '@newframe/ui/text'

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
  return (
    <Selection ref={rootRef} onKeyDown={handleKeyDown}>
      <SelectionTrigger
        activeDescendant={activeOptionId}
        controls={open ? listboxId : undefined}
        expanded={open}
        label={ariaLabel}
        placeholder={!selectedItem}
        disabled={!canOpen}
        onPress={() => setOpen(!open)}
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
        <Text display='inline' role='control' truncate>
          {selectedItem?.symbol || 'Select token'}
        </Text>
        <SelectionChevron />
      </SelectionTrigger>
      {open && canOpen ? (
        <SelectionMenu>
          <SelectionList id={listboxId} label={ariaLabel}>
            {items.map((item, index) => (
              <SelectionOption
                highlighted={index === highlightedIndex}
                id={`${listboxId}-${item.id}`}
                key={item.id}
                onHighlight={() => setHighlightedIndex(index)}
                onSelect={() => selectItem(item.id)}
                selected={item.id === selectedId}
              >
                <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} />
              </SelectionOption>
            ))}
          </SelectionList>
          {footer ? <SelectionFooter>{footer}</SelectionFooter> : null}
        </SelectionMenu>
      ) : null}
    </Selection>
  )
}
