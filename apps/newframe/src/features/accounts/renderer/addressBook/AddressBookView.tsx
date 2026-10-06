import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { HoverSwapText } from '@newframe/ui/hover-swap-text'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { SearchField } from '@newframe/ui/search-field'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useRef } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { ADDRESS_BOOK_NAME_MAX_LENGTH } from '../../../../app/contracts/state/main.ts'
import type { ClipboardCapability } from '../../../../shared/renderer/capabilities.ts'
import { AddressAvatar } from '../../../../shared/renderer/ui/AddressAvatar.tsx'
import { shortAddress } from '../../../../shared/renderer/ui/AddressIdentity.tsx'
import { CopyButton } from '../../../../shared/renderer/ui/CopyButton.tsx'
import { TrayOverlay } from '../../../../shared/renderer/ui/TrayOverlay.tsx'
import AccountRenameInput from '../AccountRenameInput.tsx'

const addressLineRecipe = cva({
  base: { display: 'flex', alignItems: 'center', gap: '2', minWidth: 0 }
})

const fileInputRecipe = cva({ base: { srOnly: true } })

interface AddressBookEntryRow {
  address: string
  name: string
}

export type AddressBookPage =
  | { kind: 'list' }
  | { kind: 'new'; address: string; name: string; error: string }
  | {
      kind: 'import'
      error: string
      fileName: string
      addresses: number
      rows: number
      newEntries: number
      alreadyNamed: number
      invalidRows: number
    }

const plural = (count: number, singular: string, many = `${singular}s`) =>
  `${count} ${count === 1 ? singular : many}`

interface AddressBookViewProps {
  clipboard: ClipboardCapability
  entries: AddressBookEntryRow[]
  entryCount: number
  page: AddressBookPage
  query: string
  removingAddress: string
  renamingAddress: string
  watchError: string
  watchingAddress: string
  onBack: () => void
  onDraftChange: (change: { address?: string; name?: string }) => void
  onImportConfirm: () => void
  onImportFile: (file: File) => void
  onNewEntry: () => void
  onNewEntrySave: () => void
  onQueryChange: (query: string) => void
  onRemove: (address: string) => void
  onRemoveCancel: () => void
  onRemoveOpen: (address: string) => void
  onRenameCancel: () => void
  onRenameCommit: (address: string, name: string) => void
  onRenameOpen: (address: string) => void
  onWatch: (address: string, name: string) => void
}

export function AddressBookView(props: AddressBookViewProps) {
  const { page } = props
  let content = <AddressBookList {...props} />
  if (page.kind === 'new') {
    content = <NewEntryForm {...props} page={page} />
  } else if (page.kind === 'import') {
    content = <ImportPreview {...props} page={page} />
  }
  return (
    <TrayOverlay closeLabel='Back' label='Address book' onClose={props.onBack} title='Address book'>
      {content}
    </TrayOverlay>
  )
}

function AddressBookActions({ onImport, onNewEntry }: { onImport: () => void; onNewEntry: () => void }) {
  return (
    <>
      <Button appearance='control' label='New entry' onPress={onNewEntry} shape='pill' size='small'>
        <Icon name='plus' size='small' />
        <Text variant='compactAction'>New entry</Text>
      </Button>
      <Button appearance='control' label='Import from Gnosis Safe' onPress={onImport} shape='pill' size='small'>
        <Text variant='compactAction'>Import from Gnosis Safe</Text>
      </Button>
    </>
  )
}

function AddressBookList(props: AddressBookViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const actions = (
    <AddressBookActions onImport={() => fileInput.current?.click()} onNewEntry={props.onNewEntry} />
  )

  return (
    <Stack gap='small'>
      {props.entryCount ? (
        <>
          <Stack direction='row' gap='small'>
            {actions}
          </Stack>
          <SearchField
            label='Search address book'
            onChange={props.onQueryChange}
            onClear={() => props.onQueryChange('')}
            placeholder='Search address book'
            value={props.query}
          />
        </>
      ) : (
        <Surface padding='medium' radius='card'>
          <Stack align='center' gap='medium'>
            <Text align='center' tone='secondary' variant='supporting'>
              Name the addresses you know and Newframe shows those names wherever the addresses appear.
            </Text>
            <Stack direction='row' gap='small'>
              {actions}
            </Stack>
          </Stack>
        </Surface>
      )}
      {props.watchError ? (
        <Text tone='danger' variant='supporting'>
          {props.watchError}
        </Text>
      ) : null}
      {props.entryCount && !props.entries.length ? (
        <Text align='center' tone='disabled' variant='label'>
          No matching entries
        </Text>
      ) : null}
      {props.entries.map((entry) => (
        <AddressBookRow {...props} entry={entry} key={entry.address} />
      ))}
      <input
        accept='.csv,text/csv'
        aria-label='Gnosis Safe CSV export'
        className={fileInputRecipe()}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) {
            props.onImportFile(file)
          }
        }}
        ref={fileInput}
        tabIndex={-1}
        type='file'
      />
    </Stack>
  )
}

function AddressBookRow({
  clipboard,
  entry,
  removingAddress,
  renamingAddress,
  watchingAddress,
  onRemove,
  onRemoveCancel,
  onRemoveOpen,
  onRenameCancel,
  onRenameCommit,
  onRenameOpen,
  onWatch
}: AddressBookViewProps & { entry: AddressBookEntryRow }) {
  const { address, name } = entry
  return (
    <Surface padding='small' radius='card'>
      <Stack gap='xsmall'>
        <Stack align='center' direction='row' gap='small'>
          <AddressAvatar address={address} />
          <Stack gap='none' grow>
            {renamingAddress === address ? (
              <AccountRenameInput
                ariaLabel={`Rename ${name}`}
                initialName={name}
                onCancel={onRenameCancel}
                onCommit={(next) => onRenameCommit(address, next)}
              />
            ) : (
              <Text truncate variant='label'>
                {name}
              </Text>
            )}
            <div className={addressLineRecipe()}>
              <HoverSwapText
                alternate={
                  <Text tone='secondary' variant='nanoCode'>
                    {address}
                  </Text>
                }
              >
                <Text tone='secondary' variant='code'>
                  {shortAddress(address)}
                </Text>
              </HoverSwapText>
              <CopyButton
                clipboard={clipboard}
                copiedLabel={`Address copied for ${name}`}
                copiedTitle='Address copied'
                label={`Copy address for ${name}`}
                title='Copy address'
                value={address}
              />
            </div>
          </Stack>
          {renamingAddress === address ? null : (
            <IconButton
              appearance='ghost'
              icon='edit'
              label={`Rename ${name}`}
              onPress={() => onRenameOpen(address)}
              size='small'
              title='Rename'
            />
          )}
          <IconButton
            appearance='ghost'
            icon='trash'
            label={`Remove ${name}`}
            onPress={() => onRemoveOpen(address)}
            size='small'
            title='Remove'
            tone='danger'
          />
          <IconButton
            appearance='ghost'
            disabled={watchingAddress === address}
            icon='eye'
            label={`Watch ${name} as account`}
            onPress={() => onWatch(address, name)}
            size='small'
            title='Watch as account'
          />
        </Stack>
        {removingAddress === address ? (
          <Stack align='center' direction='row' gap='small' justify='between'>
            <Text tone='secondary' variant='caption'>
              Remove this name?
            </Text>
            <Stack direction='row' gap='xsmall'>
              <Button appearance='ghost' label={`Keep ${name}`} onPress={onRemoveCancel} size='small'>
                <Text variant='caption'>Cancel</Text>
              </Button>
              <Button
                appearance='danger'
                label={`Confirm remove ${name}`}
                onPress={() => onRemove(address)}
                size='small'
              >
                <Text variant='caption'>Remove</Text>
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  )
}

function NewEntryForm({
  page,
  onDraftChange,
  onNewEntrySave
}: AddressBookViewProps & { page: Extract<AddressBookPage, { kind: 'new' }> }) {
  return (
    <Stack gap='small'>
      <Field label='Address' vertical>
        <Input
          autoFocus
          label='Address'
          onSubmit={onNewEntrySave}
          onValueChange={(address) => onDraftChange({ address })}
          placeholder='0x...'
          spellCheck={false}
          value={page.address}
        />
      </Field>
      <Field label='Name' vertical>
        <Input
          label='Name'
          maxLength={ADDRESS_BOOK_NAME_MAX_LENGTH}
          onSubmit={onNewEntrySave}
          onValueChange={(name) => onDraftChange({ name })}
          spellCheck={false}
          value={page.name}
        />
      </Field>
      {page.error ? (
        <Text tone='danger' variant='supporting'>
          {page.error}
        </Text>
      ) : null}
      <Button appearance='primary' label='Save entry' onPress={onNewEntrySave} size='large' width='full'>
        <Text variant='action'>Save entry</Text>
      </Button>
    </Stack>
  )
}

function ImportPreview({
  page,
  onBack,
  onImportConfirm
}: AddressBookViewProps & { page: Extract<AddressBookPage, { kind: 'import' }> }) {
  return (
    <Stack gap='small'>
      <Surface padding='medium' radius='card'>
        <Stack gap='xsmall'>
          <Text tone='muted' truncate variant='caption'>
            {page.fileName}
          </Text>
          <Text variant='label'>
            {`${plural(page.addresses, 'address', 'addresses')} in ${plural(page.rows, 'row')}`}
          </Text>
          <Text variant='supporting'>{`${page.newEntries} new`}</Text>
          <Text tone='secondary' variant='supporting'>{`${page.alreadyNamed} already named`}</Text>
          {page.invalidRows ? (
            <Text tone='danger' variant='supporting'>
              {plural(page.invalidRows, 'invalid row')}
            </Text>
          ) : null}
        </Stack>
      </Surface>
      {page.error ? (
        <Text tone='danger' variant='supporting'>
          {page.error}
        </Text>
      ) : null}
      <Button
        appearance='primary'
        disabled={!page.newEntries}
        label={`Import ${page.newEntries}`}
        onPress={onImportConfirm}
        size='large'
        width='full'
      >
        <Text variant='action'>{`Import ${page.newEntries}`}</Text>
      </Button>
      <Button appearance='ghost' label='Cancel import' onPress={onBack} size='medium' width='full'>
        <Text variant='compactAction'>Cancel</Text>
      </Button>
    </Stack>
  )
}
