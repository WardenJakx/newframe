import React from 'react'
import {
  AssetSelectorButton,
  AssetSelectorPanel,
  AssetSelectorText,
  type AssetSelectorVariant
} from '@newframe/ui/asset-selector'
import { Icon } from '@newframe/ui/icon'

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
  const triggerVariants: AssetSelectorVariant[] = [
    'tokenSelectorTrigger',
    ...(selectedItem ? [] : (['tokenSelectorTriggerPlaceholder'] as const)),
    ...(canOpen ? [] : (['tokenSelectorTriggerDisabled'] as const))
  ]

  return (
    <AssetSelectorPanel variants='tokenSelector' ref={rootRef} onKeyDown={handleKeyDown}>
      <AssetSelectorButton
        aria-activedescendant={activeOptionId}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={ariaLabel}
        variants={triggerVariants}
        disabled={!canOpen}
        onClick={() => setOpen(!open)}
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
        <AssetSelectorText variants='tokenSelectorTriggerSymbol'>
          {selectedItem?.symbol || 'Select token'}
        </AssetSelectorText>
        <AssetSelectorText variants='tokenSelectorChevron'>
          <Icon name='chevronUp' size='small' />
        </AssetSelectorText>
      </AssetSelectorButton>
      {open && canOpen ? (
        <AssetSelectorPanel variants='tokenSelectorMenu'>
          <AssetSelectorPanel
            aria-label={ariaLabel}
            variants='tokenSelectorListbox'
            id={listboxId}
            role='listbox'
          >
            {items.map((item, index) => (
              <AssetSelectorButton
                aria-selected={item.id === selectedId}
                variants={
                  index === highlightedIndex
                    ? ['tokenSelectorOption', 'tokenSelectorOptionHighlighted']
                    : 'tokenSelectorOption'
                }
                id={`${listboxId}-${item.id}`}
                key={item.id}
                onClick={() => selectItem(item.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
                role='option'
                tabIndex={-1}
              >
                <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} />
              </AssetSelectorButton>
            ))}
          </AssetSelectorPanel>
          {footer ? <AssetSelectorPanel variants='tokenSelectorFooter'>{footer}</AssetSelectorPanel> : null}
        </AssetSelectorPanel>
      ) : null}
    </AssetSelectorPanel>
  )
}
