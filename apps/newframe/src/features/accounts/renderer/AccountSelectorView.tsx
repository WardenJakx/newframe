import { Icon } from '@newframe/ui/icon'
import { Inline } from '@newframe/ui/inline'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { SearchField } from '@newframe/ui/search-field'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, type DragEventHandler, type ReactNode } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { SidePanelHeader } from '../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import { signerIconName } from '../../../shared/renderer/ui/signerPresentation'
import { accountMatchesQuery, type AccountListItem, type AccountListModel } from './accountsModel'

const accountRowRecipe = cva({
  base: {
    position: 'relative',
    display: 'flex',
    minHeight: 'menu-row-min',
    alignItems: 'center',
    gap: '4',
    padding: '5 6',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'control',
    background: 'bg.card'
  },
  variants: {
    interactive: { true: { cursor: 'pointer', _hover: { background: 'bg.hover' } }, false: {} },
    selected: { true: { borderColor: 'border.focus' }, false: {} },
    dragging: { true: { opacity: 'disabled' }, false: {} },
    dropTarget: { true: { borderColor: 'border.focus', background: 'action.primary.subtle' }, false: {} }
  },
  defaultVariants: { dragging: false, dropTarget: false, selected: false }
})

const accountIconRecipe = cva({
  base: {
    display: 'grid',
    width: 'icon-button-medium',
    height: 'icon-button-medium',
    flex: 'none',
    placeItems: 'center',
    borderRadius: 'pill',
    background: 'bg.control',
    color: 'action.primary'
  }
})

const overlayRecipe = cva({
  base: {
    position: 'absolute',
    inset: 0,
    zIndex: 'overlay',
    display: 'flex',
    flexDirection: 'column',
    background: 'bg.primary',
    overflow: 'hidden'
  }
})

export function AccountRow({
  account,
  selected,
  onSelect,
  management,
  opensPicker = false
}: {
  account: AccountListItem
  selected: boolean
  opensPicker?: boolean
  onSelect?: (accountId: string) => void
  management?: {
    dragging: boolean
    dropTarget: boolean
    onDragOver: DragEventHandler<HTMLDivElement>
    onDrop: DragEventHandler<HTMLDivElement>
    dragHandle: ReactNode
    name: ReactNode
    actions: ReactNode
  }
}) {
  return (
    <div
      aria-current={selected ? 'true' : undefined}
      aria-label={`${account.displayName} ${account.shortAddress}`}
      className={accountRowRecipe({
        interactive: Boolean(onSelect),
        selected,
        dragging: management?.dragging,
        dropTarget: management?.dropTarget
      })}
      onDragOver={management?.onDragOver}
      onDrop={management?.onDrop}
      onClick={onSelect ? () => onSelect(account.id) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                onSelect(account.id)
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      {management?.dragHandle}
      <span className={accountIconRecipe()}>
        <Icon name={signerIconName(account.signerType)} size='large' />
      </span>
      <Stack gap='none' grow>
        {management?.name ?? (
          <Text variant='label' truncate>
            {account.displayName}
          </Text>
        )}
        <Text tone='muted' variant='code'>
          {account.shortAddress}
        </Text>
        {account.signerLabel || account.agentEnabled ? (
          <Inline align='center' gap='xsmall'>
            {account.signerLabel ? (
              <Text tone='accent' variant='micro'>
                {account.signerLabel}
              </Text>
            ) : null}
            {account.agentEnabled ? (
              <Text tone='accent' variant='micro'>
                · AI Wallet
              </Text>
            ) : null}
          </Inline>
        ) : null}
      </Stack>
      <Text align='end' variant='numeric' shrink={false}>
        {account.balanceLabel}
      </Text>

      {opensPicker ? <Icon name='chevronDown' size='small' tone='muted' /> : null}
      {management?.actions}
    </div>
  )
}

export interface AccountSelectorViewProps {
  model: AccountListModel
  open: boolean
  query: string
  onOpenChange: (open: boolean) => void
  onSearchChange: (query: string) => void
  onAccountSelect: (accountId: string) => void
}

export function AccountSelectorView({
  model,
  open,
  query,
  onOpenChange,
  onSearchChange,
  onAccountSelect
}: AccountSelectorViewProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) searchRef.current?.focus()
    else if (wasOpen.current) triggerRef.current?.querySelector<HTMLElement>('[role=button]')?.focus()
    wasOpen.current = open
  }, [open])
  const close = () => onOpenChange(false)
  const selected = model.items.find((account) => account.id === model.currentAccountId)
  const items = model.items.filter((account) => accountMatchesQuery(account, query))
  return (
    <>
      <div ref={triggerRef} inert={open}>
        {selected ? (
          <AccountRow account={selected} selected={false} opensPicker onSelect={() => onOpenChange(true)} />
        ) : (
          <Text tone='muted'>No account selected</Text>
        )}
      </div>
      {open ? (
        <div
          role='dialog'
          aria-label='Select account'
          className={overlayRecipe()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          <SidePanelHeader closeLabel='Back to connection' onClose={close} title='Select account' />
          <Surface padding='small' tone='transparent'>
            <SearchField
              inputRef={searchRef}
              label='Search accounts'
              placeholder='Search accounts'
              value={query}
              onChange={onSearchChange}
              onClear={() => onSearchChange('')}
            />
          </Surface>
          <ScrollArea height='fill'>
            <Surface padding='small' tone='transparent'>
              <Stack gap='small'>
                {items.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    selected={account.id === model.currentAccountId}
                    onSelect={onAccountSelect}
                  />
                ))}
                {items.length === 0 ? (
                  <Text align='center' tone='disabled' variant='overline'>
                    No Accounts Found
                  </Text>
                ) : null}
              </Stack>
            </Surface>
          </ScrollArea>
        </div>
      ) : null}
    </>
  )
}
