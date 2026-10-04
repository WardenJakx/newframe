import { Button } from '@newframe/ui/button'
import { SearchField } from '@newframe/ui/search-field'
import { Selection, type SelectionItem } from '@newframe/ui/selection'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import React from 'react'

import type { TokenImageCapability } from '../capabilities.ts'
import ChainTokenIcon from './ChainTokenIcon.tsx'
import TokenOptionRow from './TokenOptionRow.tsx'
import type { ChainLike, ChainMetaLike, TokenSelectorItem } from './tokenSelectorTypes.ts'

interface TokenSelectorProps {
  ariaLabel: string
  imageCapability: TokenImageCapability
  items: TokenSelectorItem[]
  searchableItems?: TokenSelectorItem[]
  chains: Record<string | number, ChainLike>
  chainsMeta: Record<string | number, ChainMetaLike>
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  open: boolean
  pagination?: { rowsHidden: number; increment: number; onShowMore: () => void }
  selectedId: string
}

export default function TokenSelector(props: TokenSelectorProps) {
  return <TokenSelectorContent key={props.open ? 'open' : 'closed'} {...props} />
}

function TokenSelectorContent({
  ariaLabel,
  imageCapability,
  items,
  searchableItems = items,
  chains,
  chainsMeta,
  onOpenChange,
  onSelect,
  open,
  pagination,
  selectedId
}: TokenSelectorProps) {
  const [query, setQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const selectedItem = searchableItems.find((item) => item.id === selectedId)
  const invalidSelection = !!selectedId && !selectedItem
  const itemIds = React.useMemo(() => searchableItems.map((item) => item.id), [searchableItems])
  const itemIdsKey = itemIds.join('|')

  React.useEffect(() => {
    if (open) {
      searchInputRef.current?.focus()
    }
  }, [open])

  React.useEffect(() => {
    if (!invalidSelection) {
      return
    }
    console.warn('[TokenSelector] selectedId was not found in items', { selectedId, itemIds })
  }, [invalidSelection, itemIds, itemIdsKey, selectedId])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleItems = normalizedQuery
    ? searchableItems.filter((item) =>
        [item.symbol, item.searchText, item.id, chains[item.chainId]?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
    : items
  const selectionItems: SelectionItem[] = visibleItems.map((item) => ({
    id: item.id,
    content: (
      <TokenOptionRow imageCapability={imageCapability} item={item} chains={chains} chainsMeta={chainsMeta} />
    )
  }))

  const trigger = selectedItem ? (
    <>
      <ChainTokenIcon
        chainId={selectedItem.chainId}
        imageCapability={imageCapability}
        logoURI={selectedItem.logoURI}
        chains={chains}
        chainsMeta={chainsMeta}
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
      footer={
        !normalizedQuery && pagination && pagination.rowsHidden > 0 ? (
          <Stack>
            <Button onPress={pagination.onShowMore}>
              <Text align='center' variant='supporting' tone='secondary'>
                {`Show ${Math.min(pagination.increment, pagination.rowsHidden)} more assets`}
              </Text>
            </Button>
          </Stack>
        ) : undefined
      }
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
      menuAlign='start'
      menuWidth='wide'
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      open={open}
      placeholder={!selectedItem}
      selectedId={selectedId}
      trigger={trigger}
    />
  )
}
