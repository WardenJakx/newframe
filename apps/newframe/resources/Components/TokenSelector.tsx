import React from 'react'
import { SearchField } from '@newframe/ui/search-field'
import { Selection, type SelectionItem } from '@newframe/ui/selection'
import { Text } from '@newframe/ui/text'

import ChainTokenIcon from './ChainTokenIcon'
import TokenOptionRow from './TokenOptionRow'
import type { NetworkLike, NetworkMetaLike, TokenSelectorItem } from './tokenSelectorTypes'

interface TokenSelectorProps {
  ariaLabel: string
  footer?: React.ReactNode
  items: TokenSelectorItem[]
  searchableItems?: TokenSelectorItem[]
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  open: boolean
  selectedId: string
}

export default function TokenSelector(props: TokenSelectorProps) {
  return <TokenSelectorContent key={props.open ? 'open' : 'closed'} {...props} />
}

function TokenSelectorContent({
  ariaLabel,
  footer,
  items,
  searchableItems = items,
  networks,
  networksMeta,
  onOpenChange,
  onSelect,
  open,
  selectedId
}: TokenSelectorProps) {
  const [query, setQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const selectedItem = searchableItems.find((item) => item.id === selectedId)
  const invalidSelection = !!selectedId && !selectedItem
  const itemIds = React.useMemo(() => searchableItems.map((item) => item.id), [searchableItems])
  const itemIdsKey = itemIds.join('|')

  React.useEffect(() => {
    if (open) searchInputRef.current?.focus()
  }, [open])

  React.useEffect(() => {
    if (!invalidSelection) return
    console.warn('[TokenSelector] selectedId was not found in items', { selectedId, itemIds })
  }, [invalidSelection, itemIds, itemIdsKey, selectedId])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleItems = normalizedQuery
    ? searchableItems.filter((item) =>
        [item.symbol, item.searchText, item.id, networks[item.chainId]?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
    : items
  const selectionItems: SelectionItem[] = visibleItems.map((item) => ({
    id: item.id,
    content: <TokenOptionRow item={item} networks={networks} networksMeta={networksMeta} />
  }))

  const trigger = selectedItem ? (
    <>
      <ChainTokenIcon
        chainId={selectedItem.chainId}
        logoURI={selectedItem.logoURI}
        networks={networks}
        networksMeta={networksMeta}
        size='sm'
        symbol={selectedItem.symbol}
        tokenId={selectedItem.id}
      />
      <Text display='inline' variant='control' truncate>
        {selectedItem.symbol}
      </Text>
    </>
  ) : (
    <Text display='inline' variant='control' truncate>
      Select token
    </Text>
  )

  return (
    <Selection
      emptyContent={
        <Text align='center' tone='secondary' variant='supporting'>
          No tokens found
        </Text>
      }
      footer={normalizedQuery ? undefined : footer}
      header={
        <SearchField
          inputRef={searchInputRef}
          label='Search tokens'
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder='Search tokens'
          value={query}
        />
      }
      items={selectionItems}
      label={ariaLabel}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      open={open}
      placeholder={!selectedItem}
      selectedId={selectedId}
      trigger={trigger}
    />
  )
}
