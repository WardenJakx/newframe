import React from 'react'
import { Selection, type SelectionItem } from '@newframe/ui/selection'
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
  const selectedItem = items.find((item) => item.id === selectedId)
  const invalidSelection = !!selectedId && !selectedItem
  const itemIds = React.useMemo(() => items.map((item) => item.id), [items])
  const itemIdsKey = itemIds.join('|')

  React.useEffect(() => {
    if (!invalidSelection) return
    console.warn('[TokenSelector] selectedId was not found in items', { selectedId, itemIds })
  }, [invalidSelection, itemIds, itemIdsKey, selectedId])

  const selectionItems: SelectionItem[] = items.map((item) => ({
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
      footer={footer}
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
