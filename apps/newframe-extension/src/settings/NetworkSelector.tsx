import { Button } from '@newframe/ui/button'
import { Group } from '@newframe/ui/group'
import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { SearchField } from '@newframe/ui/search-field'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'

import { cva } from '../styled-system/css/cva.js'

const selectionMarkRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-small',
    height: 'icon-small',
    flexShrink: 0,
    placeItems: 'center'
  }
})

const networkIconRecipe = cva({
  base: {
    display: 'grid',
    width: 'media-small',
    height: 'media-small',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: '50%',
    background: 'bg.control',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' }
  }
})

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

function NetworkIcon({ iconUrl }: Pick<NetworkSelectorOption, 'iconUrl'>) {
  return (
    <span className={networkIconRecipe()}>
      {iconUrl ? <Image alt='' size='fill' source={iconUrl} /> : null}
    </span>
  )
}

export function NetworkSelector({ label, onSelect, options }: NetworkSelectorProps) {
  const [query, setQuery] = useState('')
  const selectedOption = useRef<HTMLButtonElement | null>(null)
  const selectedId = options.find((option) => option.selected)?.id
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options

  useEffect(() => {
    if (!query) selectedOption.current?.scrollIntoView?.({ block: 'nearest' })
  }, [query, selectedId])

  return (
    <Group label={label}>
      <Stack gap='xsmall'>
        <SearchField
          label={`Search ${label.toLocaleLowerCase()}`}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder={`Search ${label.toLocaleLowerCase()}`}
          value={query}
        />
        <ScrollArea height='menu'>
          <Stack gap='none'>
            {visibleOptions.length ? (
              visibleOptions.map((option) => (
                <Button
                  appearance='selectionOption'
                  disabled={option.disabled}
                  key={option.id}
                  label={option.label}
                  onPress={() => onSelect(option.id)}
                  ref={option.selected ? selectedOption : undefined}
                  selected={option.selected}
                  width='full'
                >
                  <span className={selectionMarkRecipe()}>
                    {option.selected ? <Icon name='check' size='small' tone='accent' /> : null}
                  </span>
                  <NetworkIcon iconUrl={option.iconUrl} />
                  <Text tone={option.disabled ? 'muted' : 'primary'} truncate variant='label'>
                    {option.label}
                  </Text>
                </Button>
              ))
            ) : (
              <Text tone='muted' variant='supporting'>
                No matching networks
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Group>
  )
}
