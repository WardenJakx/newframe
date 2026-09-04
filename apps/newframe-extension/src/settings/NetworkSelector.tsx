import { Icon } from '@newframe/ui/icon'
import { MediaIcon } from '@newframe/ui/media-icon'
import { SearchField } from '@newframe/ui/search-field'
import { Selection } from '@newframe/ui/selection'
import { Text } from '@newframe/ui/text'
import { useState } from 'react'

export type NetworkSelectorOption = {
  disabled?: boolean
  iconUrl?: string
  id: string
  label: string
  selected: boolean
}

export type NetworkSelectorProps = {
  label: string
  onSelect: (id: string) => void
  options: readonly NetworkSelectorOption[]
}

export function NetworkSelector({ label, onSelect, options }: NetworkSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedOption = options.find((option) => option.selected)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options

  return (
    <Selection
      emptyContent={
        <Text align='center' tone='muted' variant='supporting'>
          No matching networks
        </Text>
      }
      header={
        <SearchField
          label={`Search ${label.toLocaleLowerCase()}`}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder={`Search ${label.toLocaleLowerCase()}`}
          value={query}
        />
      }
      items={visibleOptions.map((option) => ({
        content: (
          <>
            <Icon name='check' size='small' tone='accent' visible={option.selected} />
            <MediaIcon source={option.iconUrl} />
            <Text tone={option.disabled ? 'muted' : 'primary'} truncate variant='label'>
              {option.label}
            </Text>
          </>
        ),
        disabled: option.disabled,
        id: option.id
      }))}
      label={label}
      menuAlign='end'
      menuWidth='wide'
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery('')
      }}
      onSelect={onSelect}
      open={open}
      placeholder={!selectedOption}
      selectedId={selectedOption?.id}
      trigger={
        selectedOption ? (
          <>
            <MediaIcon size='compact' source={selectedOption.iconUrl} />
            <Text display='inline' truncate variant='compactAction'>
              {selectedOption.label}
            </Text>
          </>
        ) : (
          <Text display='inline' truncate variant='compactAction'>
            {label}
          </Text>
        )
      }
      triggerSize='compact'
    />
  )
}
