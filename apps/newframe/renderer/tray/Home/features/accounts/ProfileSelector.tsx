import React from 'react'

import { Button } from '@newframe/ui/button'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Selection, type SelectionItem } from '@newframe/ui/selection'
import { Text } from '@newframe/ui/text'

import type { WalletRendererState } from '../../../../../contracts/state/projections'
import { formatUsdRate } from '../../../../../domain/balance'
import { cva } from '../../../../../generated/styled-system/css/cva.js'
import link from '../../../../shared/link'

type ProfileSummary = WalletRendererState['profiles'][number]
type MovableAccount = {
  id: string
  address: string
  name: string
  profileId: string
}

interface ProfileSelectorProps {
  currentProfile: string
  profiles: ProfileSummary[]
}

type ManagementMode = 'none' | 'create' | 'rename' | 'delete'

const managementRecipe = cva({
  base: {
    width: 'selection-menu',
    maxWidth: 'calc(100vw - token(sizes.field))'
  }
})

const columnRecipe = cva({
  base: { display: 'flex', minWidth: 0, flexDirection: 'column' },
  variants: {
    gap: { none: { gap: 0 }, xsmall: { gap: '2' }, small: { gap: '4' } },
    grow: { true: { flex: '1 1 0' }, false: {} }
  },
  defaultVariants: { gap: 'small', grow: false }
})

const rowRecipe = cva({
  base: { display: 'flex', minWidth: 0, alignItems: 'center', gap: '4' },
  variants: { grow: { true: { flex: '1 1 0' }, false: {} } },
  defaultVariants: { grow: false }
})

function profileValue(profile: ProfileSummary) {
  if (profile.cachedValue.state === 'missing') return '---'
  if (profile.cachedValue.state === 'unpriced') return '—'
  return `$${formatUsdRate(profile.cachedValue.value, 2)}`
}

function errorMessage(error: string, fallback: string) {
  const messages: Record<string, string> = {
    duplicate_name: 'A profile with that name already exists.',
    final_profile: 'Keep at least one profile.',
    invalid_name: 'Enter a profile name between 1 and 50 characters.',
    profile_not_empty: 'Move or remove every account before deleting this profile.',
    profile_not_found: 'That profile is no longer available.'
  }
  return messages[error] || fallback
}

export function ProfileSelector({ currentProfile, profiles }: ProfileSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<ManagementMode>('none')
  const [name, setName] = React.useState('')
  const [movableAccounts, setMovableAccounts] = React.useState<MovableAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>([])
  const [loadingAccounts, setLoadingAccounts] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const activeProfile = profiles.find((profile) => profile.id === currentProfile) || profiles[0]

  const resetManagement = React.useCallback(() => {
    setMode('none')
    setName('')
    setMovableAccounts([])
    setSelectedAccountIds([])
    setLoadingAccounts(false)
    setSubmitting(false)
    setError('')
  }, [])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) resetManagement()
    },
    [resetManagement]
  )

  const handleSelect = React.useCallback(
    async (profileId: string) => {
      if (profileId === currentProfile) return
      setError('')
      const result = await link.executeCommand({ type: 'profile.select', profileId })
      if (!result.ok) {
        setError(errorMessage(result.error, 'Could not switch profiles. Try again.'))
        setOpen(true)
      }
    },
    [currentProfile]
  )

  const openCreate = React.useCallback(async () => {
    setMode('create')
    setName('')
    setMovableAccounts([])
    setSelectedAccountIds([])
    setError('')
    setLoadingAccounts(true)

    const result = await link.executeQuery({ type: 'profile.movable-accounts' })
    setLoadingAccounts(false)
    if (result.ok) {
      setMovableAccounts(result.accounts)
    } else {
      setError('Could not load accounts to move. You can still create an empty profile.')
    }
  }, [])

  const submitCreate = React.useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
      setError('Enter a profile name between 1 and 50 characters.')
      return
    }

    setSubmitting(true)
    setError('')
    const result = await link.executeCommand({
      type: 'profile.create',
      name: trimmedName,
      ...(selectedAccountIds.length ? { accountIds: selectedAccountIds } : {})
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not create the profile. Try again.'))
      return
    }
    resetManagement()
    setOpen(false)
  }, [name, resetManagement, selectedAccountIds])

  const openRename = React.useCallback(() => {
    if (!activeProfile) return
    setMode('rename')
    setName(activeProfile.name)
    setError('')
  }, [activeProfile])

  const submitRename = React.useCallback(async () => {
    if (!activeProfile) return
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
      setError('Enter a profile name between 1 and 50 characters.')
      return
    }

    setSubmitting(true)
    setError('')
    const result = await link.executeCommand({
      type: 'profile.rename',
      profileId: activeProfile.id,
      name: trimmedName
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not rename the profile. Try again.'))
      return
    }
    resetManagement()
  }, [activeProfile, name, resetManagement])

  const submitDelete = React.useCallback(async () => {
    if (!activeProfile || activeProfile.accountCount > 0 || profiles.length <= 1) return
    setSubmitting(true)
    setError('')
    const result = await link.executeCommand({ type: 'profile.delete', profileId: activeProfile.id })
    setSubmitting(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not delete the profile. Try again.'))
      return
    }
    resetManagement()
    setOpen(false)
  }, [activeProfile, profiles.length, resetManagement])

  const toggleAccount = React.useCallback((accountId: string) => {
    setSelectedAccountIds((ids) =>
      ids.includes(accountId) ? ids.filter((id) => id !== accountId) : [...ids, accountId]
    )
  }, [])

  const items: SelectionItem[] = profiles.map((profile) => ({
    id: profile.id,
    content: (
      <div className={rowRecipe({ grow: true })}>
        <div className={columnRecipe({ gap: 'none', grow: true })}>
          <Text variant='label' truncate>
            {profile.name}
          </Text>
          <Text tone='muted' variant='micro'>
            {profile.accountCount} {profile.accountCount === 1 ? 'Account' : 'Accounts'}
          </Text>
        </div>
        <Text align='end' variant='numeric' shrink={false}>
          {profileValue(profile)}
        </Text>
        {profile.id === currentProfile ? <Text tone='accent'>✓</Text> : null}
      </div>
    )
  }))

  const footer = (
    <div className={managementRecipe()} onKeyDown={(event) => event.stopPropagation()}>
      <div className={columnRecipe({ gap: 'small' })}>
        {mode === 'create' ? (
          <>
            <Input
              autoFocus
              invalid={!!error && (!name.trim() || name.trim().length > 50)}
              label='New profile name'
              maxLength={50}
              onCancel={resetManagement}
              onSubmit={() => void submitCreate()}
              onValueChange={setName}
              placeholder='Profile name'
              value={name}
            />
            {loadingAccounts ? <Text tone='secondary'>Loading accounts…</Text> : null}
            {!loadingAccounts && movableAccounts.length ? (
              <ScrollArea height='menu'>
                <div className={columnRecipe({ gap: 'xsmall' })}>
                  <Text tone='secondary' variant='caption'>
                    Move accounts into this profile (optional)
                  </Text>
                  {movableAccounts.map((account) => {
                    const selected = selectedAccountIds.includes(account.id)
                    return (
                      <Button
                        appearance={selected ? 'subtle' : 'row'}
                        key={account.id}
                        onPress={() => toggleAccount(account.id)}
                        size='small'
                        width='full'
                      >
                        <Text tone={selected ? 'accent' : 'secondary'}>{selected ? '✓' : '○'}</Text>
                        <div className={columnRecipe({ gap: 'none', grow: true })}>
                          <Text variant='caption' truncate>
                            {account.name}
                          </Text>
                          <Text tone='muted' variant='micro' truncate>
                            {account.address}
                          </Text>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : null}
            <div className={rowRecipe()}>
              <Button
                appearance='primary'
                disabled={submitting}
                onPress={() => void submitCreate()}
                size='small'
              >
                <Text variant='caption'>Create profile</Text>
              </Button>
              <Button appearance='ghost' onPress={resetManagement} size='small'>
                <Text variant='caption'>Cancel</Text>
              </Button>
            </div>
          </>
        ) : mode === 'rename' ? (
          <>
            <Input
              autoFocus
              invalid={!!error && (!name.trim() || name.trim().length > 50)}
              label='Rename profile'
              maxLength={50}
              onCancel={resetManagement}
              onSubmit={() => void submitRename()}
              onValueChange={setName}
              value={name}
            />
            <div className={rowRecipe()}>
              <Button
                appearance='primary'
                disabled={submitting}
                onPress={() => void submitRename()}
                size='small'
              >
                <Text variant='caption'>Save</Text>
              </Button>
              <Button appearance='ghost' onPress={resetManagement} size='small'>
                <Text variant='caption'>Cancel</Text>
              </Button>
            </div>
          </>
        ) : mode === 'delete' ? (
          <>
            <Text variant='caption'>Delete {activeProfile?.name}? This cannot be undone.</Text>
            <div className={rowRecipe()}>
              <Button
                appearance='danger'
                disabled={submitting}
                onPress={() => void submitDelete()}
                size='small'
              >
                <Text variant='caption'>Confirm delete</Text>
              </Button>
              <Button appearance='ghost' onPress={resetManagement} size='small'>
                <Text variant='caption'>Cancel</Text>
              </Button>
            </div>
          </>
        ) : (
          <div className={rowRecipe()}>
            <Button appearance='control' onPress={() => void openCreate()} size='small'>
              <Text variant='caption'>Create</Text>
            </Button>
            <Button appearance='ghost' disabled={!activeProfile} onPress={openRename} size='small'>
              <Text variant='caption'>Rename</Text>
            </Button>
            <Button
              appearance='danger'
              disabled={!activeProfile || activeProfile.accountCount > 0 || profiles.length <= 1}
              onPress={() => {
                setMode('delete')
                setError('')
              }}
              size='small'
            >
              <Text variant='caption'>Delete</Text>
            </Button>
          </div>
        )}
        {error ? (
          <Text tone='danger' variant='caption'>
            {error}
          </Text>
        ) : null}
        {mode === 'none' && activeProfile?.accountCount ? (
          <Text tone='muted' variant='micro'>
            Move all accounts before deleting this profile.
          </Text>
        ) : null}
        {mode === 'none' && profiles.length <= 1 ? (
          <Text tone='muted' variant='micro'>
            Keep at least one profile.
          </Text>
        ) : null}
      </div>
    </div>
  )

  return (
    <Selection
      footer={footer}
      items={items}
      label='Select active profile'
      onOpenChange={handleOpenChange}
      onSelect={(profileId) => void handleSelect(profileId)}
      open={open}
      placeholder={!activeProfile}
      selectedId={currentProfile}
      trigger={
        <Text display='inline' variant='control' truncate>
          {activeProfile?.name || 'Profiles'}
        </Text>
      }
    />
  )
}
