import { getAddress, isAddress } from 'ethers'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { CommandResult } from '../../../../app/contracts/operations.ts'
import { ADDRESS_BOOK_NAME_MAX_LENGTH } from '../../../../app/contracts/state/main.ts'
import type { MainTrayProjection } from '../../../../platform/state-sync/contract/projections.ts'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector.tsx'
import { parseSafeAddressBookCsv, type SafeAddressBookCsv } from '../../domain/addressBook/safeCsv.ts'
import type { AccountsCapability } from '../accountsCapability.ts'
import { AddressBookView, type AddressBookPage } from './AddressBookView.tsx'

type AddressBookCapability = Pick<
  AccountsCapability,
  | 'createAccount'
  | 'importAddressBookEntries'
  | 'removeAddressBookEntry'
  | 'saveAddressBookEntry'
  | 'writeText'
>

type Draft =
  | { kind: 'list' }
  | { kind: 'new'; address: string; name: string; error: string }
  | { kind: 'import'; fileName: string; csv: SafeAddressBookCsv; error: string }

const failureMessage = (result: CommandResult, fallback: string) =>
  result.ok ? fallback : (result.message ?? fallback)

export function AddressBook({
  capability,
  onBack
}: {
  capability: AddressBookCapability
  onBack: () => void
}) {
  const { addressNames, operations } = useWalletSelector(
    useShallow((state) => ({
      addressNames: state.addressNames as Record<
        string,
        MainTrayProjection['addressNames'][string] | undefined
      >,
      operations: state.operations as Record<string, MainTrayProjection['operations'][string] | undefined>
    }))
  )
  const [draft, setDraft] = useState<Draft>({ kind: 'list' })
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState('')
  const [removing, setRemoving] = useState('')
  const [watching, setWatching] = useState<{ address: string; operationId: string; error?: string }>()

  const watchOperation = watching ? operations[watching.operationId] : undefined
  let watchError = watching?.error ?? ''
  if (!watchError && watchOperation?.status === 'failed') {
    watchError = watchOperation.error?.message ?? 'Could not watch account'
  }
  const watchingAddress = watching && !watchError ? watching.address : ''
  const entries = Object.entries(addressNames)
    .flatMap(([address, entry]) =>
      entry?.source === 'address-book' ? [{ address: getAddress(address), name: entry.name }] : []
    )
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  const normalizedQuery = query.trim().toLowerCase()
  const visibleEntries = entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalizedQuery) ||
      entry.address.toLowerCase().includes(normalizedQuery)
  )

  let page: AddressBookPage = { kind: 'list' }
  if (draft.kind === 'new') {
    page = draft
  } else if (draft.kind === 'import') {
    const newEntries = draft.csv.entries.filter((entry) => !addressNames[entry.address.toLowerCase()])
    page = {
      kind: 'import',
      error: draft.error,
      fileName: draft.fileName,
      addresses: draft.csv.entries.length,
      rows: draft.csv.rows,
      newEntries: newEntries.length,
      alreadyNamed: draft.csv.entries.length - newEntries.length,
      invalidRows: draft.csv.invalidRows
    }
  }

  const saveNewEntry = async () => {
    if (draft.kind !== 'new') {
      return
    }
    const address = draft.address.trim()
    const name = draft.name.trim().slice(0, ADDRESS_BOOK_NAME_MAX_LENGTH)
    let error = ''
    if (!isAddress(address)) {
      error = 'Enter a valid address'
    } else if (addressNames[address.toLowerCase()]?.source === 'account') {
      error = 'This address is already an account in this profile'
    } else if (!name) {
      error = 'Enter a name'
    }
    if (error) {
      setDraft({ ...draft, error })
      return
    }
    const result = await capability.saveAddressBookEntry({ address, name })
    setDraft(
      result.ok ? { kind: 'list' } : { ...draft, error: failureMessage(result, 'Could not save entry') }
    )
  }

  const readImportFile = async (file: File) => {
    const csv = parseSafeAddressBookCsv(await file.text())
    setDraft({ kind: 'import', fileName: file.name, csv, error: '' })
  }

  const importNewEntries = async () => {
    if (draft.kind !== 'import') {
      return
    }
    const newEntries = draft.csv.entries.filter((entry) => !addressNames[entry.address.toLowerCase()])
    const result = await capability.importAddressBookEntries({ entries: newEntries })
    setDraft(
      result.ok ? { kind: 'list' } : { ...draft, error: failureMessage(result, 'Could not import entries') }
    )
  }

  const watch = async (address: string, name: string) => {
    const operationId = crypto.randomUUID()
    setWatching({ address, operationId })
    const result = await capability.createAccount({
      source: 'watch',
      operationId,
      addressOrName: address,
      name
    })
    if (!result.ok) {
      setWatching({ address, operationId, error: failureMessage(result, 'Could not watch account') })
    }
  }

  return (
    <AddressBookView
      clipboard={capability}
      entries={visibleEntries}
      entryCount={entries.length}
      page={page}
      query={query}
      removingAddress={removing}
      renamingAddress={renaming}
      watchError={watchError}
      watchingAddress={watchingAddress}
      onBack={() => (draft.kind === 'list' ? onBack() : setDraft({ kind: 'list' }))}
      onDraftChange={(change) => draft.kind === 'new' && setDraft({ ...draft, ...change, error: '' })}
      onImportConfirm={() => void importNewEntries()}
      onImportFile={(file) => void readImportFile(file)}
      onNewEntry={() => setDraft({ kind: 'new', address: '', name: '', error: '' })}
      onNewEntrySave={() => void saveNewEntry()}
      onQueryChange={setQuery}
      onRemove={(address) => {
        setRemoving('')
        void capability.removeAddressBookEntry({ address })
      }}
      onRemoveCancel={() => setRemoving('')}
      onRemoveOpen={setRemoving}
      onRenameCancel={() => setRenaming('')}
      onRenameCommit={(address, name) => {
        setRenaming('')
        void capability.saveAddressBookEntry({ address, name: name.slice(0, ADDRESS_BOOK_NAME_MAX_LENGTH) })
      }}
      onRenameOpen={setRenaming}
      onWatch={(address, name) => void watch(address, name)}
    />
  )
}
