import type { Ref } from 'react'

import { cva } from '../styled-system/css/cva.js'
import { Icon } from './Icon.js'
import { IconButton } from './IconButton.js'
import { Input } from './Input.js'

const searchFieldRecipe = cva({
  base: {
    height: 'search-field',
    display: 'flex',
    alignItems: 'center',
    gap: '4',
    paddingInlineStart: '7',
    paddingInlineEnd: '2',
    borderRadius: 'pill',
    background: 'bg.raised',
    color: 'text.muted'
  }
})

export type SearchFieldProps = {
  inputRef?: Ref<HTMLInputElement>
  label: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
  value: string
}

export function SearchField({ inputRef, label, onChange, onClear, placeholder, value }: SearchFieldProps) {
  return (
    <div className={searchFieldRecipe()}>
      <Icon name='search' size='small' tone='muted' />
      <Input
        appearance='plain'
        ref={inputRef}
        label={label}
        onValueChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
      {value ? <IconButton icon='close' label={`Clear ${label}`} onPress={onClear} size='small' /> : null}
    </div>
  )
}
