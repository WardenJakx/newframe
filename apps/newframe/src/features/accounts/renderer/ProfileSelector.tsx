import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Text } from '@newframe/ui/text'
import React from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import {
  selectOperationById,
  selectOperationEntityId
} from '../../../platform/state-sync/renderer/selectors/operation'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { AddressAvatar } from '../../../shared/renderer/ui/AddressAvatar'
import { shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import { formatUsdRate } from '../../asset-data/domain/balance'
import type { AccountsCapability } from './accountsCapability'

type ProfileSummary = WalletRendererState['profiles'][number]
type MovableAccount = {
  accountType?: string
  id: string
  address: string
  name: string
  profileId: string
}

interface ProfileSelectorProps {
  capability: Pick<
    AccountsCapability,
    'selectProfile' | 'createProfile' | 'updateProfile' | 'deleteProfile' | 'listMovableProfileAccounts'
  >
  currentProfile: string
  profiles: ProfileSummary[]
}

type ManagementMode = 'none' | 'create' | 'rename' | 'delete'
type ProfileSubmission = {
  operationId: string
  type: 'profile.select' | 'profile.create' | 'profile.update' | 'profile.delete'
  profileId?: string
  name?: string
}

function isCurrentSubmission(ref: React.RefObject<ProfileSubmission | null>, operationId: string) {
  return ref.current?.operationId === operationId
}

const selectorRecipe = cva({
  base: { flex: '1 1 0', minWidth: 0, marginInline: '4' }
})

const menuRecipe = cva({
  base: {
    position: 'absolute',
    insetInline: '7',
    insetBlockStart: '100%',
    marginBlockStart: '3',
    zIndex: 'header',
    padding: '3',
    borderRadius: 'default',
    background: 'bg.hover',
    boxShadow: 'elevation-overlay',
    maxHeight: 'calc(100vh - token(sizes.panel-header) - token(spacing.7) * 2)',
    overflowY: 'auto'
  }
})

const profileRowRecipe = cva({
  base: {
    borderRadius: 'compact',
    paddingInlineEnd: '2',
    '& > div > button': { minWidth: 0 },
    '& > div > button[aria-pressed="true"]': { background: 'transparent' }
  },
  variants: { selected: { true: { background: 'action.primary.subtle' }, false: {} } }
})

const managementRecipe = cva({
  base: { padding: '4' }
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
  if (profile.cachedValue.state === 'missing') {
    return '---'
  }
  if (profile.cachedValue.state === 'unpriced') {
    return '—'
  }
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

export function ProfileSelector({ capability, currentProfile, profiles }: ProfileSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuId = React.useId()
  const [managedProfileId, setManagedProfileId] = React.useState('')
  const [mode, setMode] = React.useState<ManagementMode>('none')
  const [name, setName] = React.useState('')
  const [movableAccounts, setMovableAccounts] = React.useState<MovableAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>([])
  const [loadingAccounts, setLoadingAccounts] = React.useState(false)
  const [submission, setSubmission] = React.useState<ProfileSubmission | null>(null)
  const submissionRef = React.useRef<ProfileSubmission | null>(null)
  const movableAccountsRequestRef = React.useRef('')
  const [error, setError] = React.useState('')
  const activeProfile = profiles.find((profile) => profile.id === currentProfile) ?? profiles.at(0)
  const managedProfile = profiles.find((profile) => profile.id === managedProfileId)
  const trackedOperation = useWalletSelector((state) =>
    submission ? selectOperationById(state, submission.operationId) : undefined
  )
  const createdProfileId = useWalletSelector((state) =>
    submission?.type === 'profile.create'
      ? selectOperationEntityId(state, submission.operationId, 'profile')
      : undefined
  )
  const submitting = trackedOperation?.status === 'pending'
  const operationFailure =
    trackedOperation?.status === 'failed'
      ? errorMessage(trackedOperation.error?.code ?? '', 'Profile operation failed. Try again.')
      : ''
  let submissionMatchesState = false
  if (submission?.type === 'profile.select') {
    submissionMatchesState = currentProfile === submission.profileId
  } else if (submission?.type === 'profile.create') {
    submissionMatchesState =
      !!createdProfileId &&
      currentProfile === createdProfileId &&
      profiles.some((profile) => profile.id === createdProfileId)
  } else if (submission?.type === 'profile.update') {
    submissionMatchesState = profiles.some(
      (profile) => profile.id === submission.profileId && profile.name === submission.name
    )
  } else if (submission?.type === 'profile.delete') {
    submissionMatchesState = !profiles.some((profile) => profile.id === submission.profileId)
  }
  const submissionReflected =
    !!submission && trackedOperation?.status === 'succeeded' && submissionMatchesState
  const displayedMode = submissionReflected ? 'none' : mode
  const displayedOpen = submissionReflected && submission.type !== 'profile.update' ? false : open
  const visibleError = submissionReflected ? '' : operationFailure || error

  const resetManagement = React.useCallback(() => {
    movableAccountsRequestRef.current = ''
    setManagedProfileId('')
    setMode('none')
    setName('')
    setMovableAccounts([])
    setSelectedAccountIds([])
    setLoadingAccounts(false)
    submissionRef.current = null
    setSubmission(null)
    setError('')
  }, [])

  React.useEffect(
    () => () => {
      submissionRef.current = null
      movableAccountsRequestRef.current = ''
    },
    []
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (submissionReflected) {
        resetManagement()
        setOpen(nextOpen)
        return
      }
      setOpen(nextOpen)
      if (!nextOpen && submissionRef.current) {
        setOpen(true)
        return
      }
      if (!nextOpen) {
        resetManagement()
      }
    },
    [resetManagement, submissionReflected]
  )

  React.useEffect(() => {
    if (!displayedOpen) {
      return
    }
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        handleOpenChange(false)
      }
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [displayedOpen, handleOpenChange])

  React.useEffect(() => {
    if (displayedOpen) {
      rootRef.current?.querySelector<HTMLButtonElement>('[data-profile-menu] button')?.focus()
    }
  }, [displayedOpen])

  const handleSelect = React.useCallback(
    async (profileId: string) => {
      if (profileId === currentProfile) {
        handleOpenChange(false)
        return
      }
      const operationId = crypto.randomUUID()
      const nextSubmission: ProfileSubmission = { operationId, type: 'profile.select', profileId }
      submissionRef.current = nextSubmission
      setSubmission(nextSubmission)
      setOpen(true)
      setError('')
      const result = await capability.selectProfile({ operationId, profileId })
      if (!isCurrentSubmission(submissionRef, operationId)) {
        return
      }
      if (!result.ok) {
        setError(errorMessage(result.error, 'Could not switch profiles. Try again.'))
        submissionRef.current = null
        setSubmission(null)
        setOpen(true)
      }
    },
    [capability, currentProfile, handleOpenChange]
  )

  const openCreate = React.useCallback(async () => {
    if (submissionReflected) {
      resetManagement()
    }
    setMode('create')
    setName('')
    setMovableAccounts([])
    setSelectedAccountIds([])
    setError('')
    setLoadingAccounts(true)

    const requestToken = crypto.randomUUID()
    movableAccountsRequestRef.current = requestToken
    const result = await capability.listMovableProfileAccounts()
    if (movableAccountsRequestRef.current !== requestToken) {
      return
    }
    movableAccountsRequestRef.current = ''
    setLoadingAccounts(false)
    if (result.ok) {
      setMovableAccounts(result.accounts)
    } else {
      setError('Could not load accounts to move. You can still create an empty profile.')
    }
  }, [capability, resetManagement, submissionReflected])

  const submitCreate = React.useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
      setError('Enter a profile name between 1 and 50 characters.')
      return
    }

    const operationId = crypto.randomUUID()
    const nextSubmission: ProfileSubmission = { operationId, type: 'profile.create', name: trimmedName }
    submissionRef.current = nextSubmission
    setSubmission(nextSubmission)
    setError('')
    const result = await capability.createProfile({
      operationId,
      name: trimmedName,
      ...(selectedAccountIds.length ? { accountIds: selectedAccountIds } : {})
    })
    if (!isCurrentSubmission(submissionRef, operationId)) {
      return
    }
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not create the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [capability, name, selectedAccountIds])

  const openRename = React.useCallback(
    (profile: ProfileSummary) => {
      if (submissionReflected) {
        resetManagement()
      }
      setManagedProfileId(profile.id)
      setMode('rename')
      setName(profile.name)
      setError('')
    },
    [resetManagement, submissionReflected]
  )

  const submitRename = React.useCallback(async () => {
    if (!managedProfile) {
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
      setError('Enter a profile name between 1 and 50 characters.')
      return
    }

    const operationId = crypto.randomUUID()
    const nextSubmission: ProfileSubmission = {
      operationId,
      type: 'profile.update',
      profileId: managedProfile.id,
      name: trimmedName
    }
    submissionRef.current = nextSubmission
    setSubmission(nextSubmission)
    setError('')
    const result = await capability.updateProfile({
      operationId,
      profileId: managedProfile.id,
      name: trimmedName
    })
    if (!isCurrentSubmission(submissionRef, operationId)) {
      return
    }
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not rename the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [managedProfile, capability, name])

  const submitDelete = React.useCallback(async () => {
    if (!managedProfile || managedProfile.accountCount > 0 || profiles.length <= 1) {
      return
    }
    const operationId = crypto.randomUUID()
    const nextSubmission: ProfileSubmission = {
      operationId,
      type: 'profile.delete',
      profileId: managedProfile.id
    }
    submissionRef.current = nextSubmission
    setSubmission(nextSubmission)
    setError('')
    const result = await capability.deleteProfile({
      operationId,
      profileId: managedProfile.id
    })
    if (!isCurrentSubmission(submissionRef, operationId)) {
      return
    }
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not delete the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [managedProfile, capability, profiles.length])

  const toggleAccount = React.useCallback((accountId: string) => {
    setSelectedAccountIds((ids) =>
      ids.includes(accountId) ? ids.filter((id) => id !== accountId) : [...ids, accountId]
    )
  }, [])

  let managementFields: React.ReactNode = null
  if (displayedMode === 'create') {
    managementFields = (
      <>
        <Input
          autoFocus
          invalid={!!visibleError && (!name.trim() || name.trim().length > 50)}
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
                    <AddressAvatar address={account.address} accountType={account.accountType} />
                    <div className={columnRecipe({ gap: 'none', grow: true })}>
                      <Text variant='caption' truncate>
                        {account.name}
                      </Text>
                      <Text tone='muted' variant='micro' truncate>
                        {shortAddress(account.address)}
                      </Text>
                    </div>
                  </Button>
                )
              })}
            </div>
          </ScrollArea>
        ) : null}
        <div className={rowRecipe()}>
          <Button appearance='primary' disabled={submitting} onPress={() => void submitCreate()} size='small'>
            <Text variant='caption'>Create profile</Text>
          </Button>
          <Button appearance='ghost' onPress={resetManagement} size='small'>
            <Text variant='caption'>Cancel</Text>
          </Button>
        </div>
      </>
    )
  } else if (displayedMode === 'rename') {
    managementFields = (
      <>
        <Input
          autoFocus
          invalid={!!visibleError && (!name.trim() || name.trim().length > 50)}
          label='Rename profile'
          maxLength={50}
          onCancel={resetManagement}
          onSubmit={() => void submitRename()}
          onValueChange={setName}
          value={name}
        />
        <div className={rowRecipe()}>
          <Button appearance='primary' disabled={submitting} onPress={() => void submitRename()} size='small'>
            <Text variant='caption'>Save</Text>
          </Button>
          <Button appearance='ghost' onPress={resetManagement} size='small'>
            <Text variant='caption'>Cancel</Text>
          </Button>
        </div>
      </>
    )
  } else if (displayedMode === 'delete') {
    managementFields = (
      <>
        <Text variant='caption'>Delete {managedProfile?.name}? This cannot be undone.</Text>
        <div className={rowRecipe()}>
          <Button appearance='danger' disabled={submitting} onPress={() => void submitDelete()} size='small'>
            <Text variant='caption'>Confirm delete</Text>
          </Button>
          <Button appearance='ghost' onPress={resetManagement} size='small'>
            <Text variant='caption'>Cancel</Text>
          </Button>
        </div>
      </>
    )
  }

  const management = (
    <div className={managementRecipe()}>
      <div className={columnRecipe({ gap: 'small' })}>
        {managementFields}
        {visibleError ? (
          <Text tone='danger' variant='caption'>
            {visibleError}
          </Text>
        ) : null}
      </div>
    </div>
  )

  return (
    <div
      className={selectorRecipe()}
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          handleOpenChange(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && displayedOpen) {
          event.stopPropagation()
          handleOpenChange(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <Button
        appearance='control'
        controls={displayedOpen ? menuId : undefined}
        expanded={displayedOpen}
        hasPopup='dialog'
        label='Select active profile'
        onPress={() => handleOpenChange(!displayedOpen)}
        ref={triggerRef}
        width='full'
      >
        <div className={rowRecipe({ grow: true })}>
          <div className={columnRecipe({ grow: true })}>
            <Text align='start' variant='control' truncate>
              {activeProfile?.name ?? 'Profiles'}
            </Text>
          </div>
          <Icon name={displayedOpen ? 'chevronUp' : 'chevronDown'} size='small' tone='muted' />
        </div>
      </Button>
      {displayedOpen ? (
        <div aria-label='Profiles' className={menuRecipe()} data-profile-menu id={menuId} role='dialog'>
          <div className={columnRecipe({ gap: 'xsmall' })}>
            {profiles.map((profile) => {
              const selected = profile.id === currentProfile
              const managing =
                managedProfileId === profile.id && (displayedMode === 'rename' || displayedMode === 'delete')
              let deleteHint = 'Delete profile'
              if (profiles.length <= 1) {
                deleteHint = 'Keep at least one profile.'
              } else if (profile.accountCount > 0) {
                deleteHint = 'Move all accounts before deleting this profile.'
              }
              return (
                <div key={profile.id} className={profileRowRecipe({ selected })}>
                  <div className={rowRecipe()}>
                    <Button
                      appearance='selectionOption'
                      label={'Switch to ' + profile.name}
                      pressed={selected}
                      onPress={() => void handleSelect(profile.id)}
                    >
                      <div className={columnRecipe({ gap: 'none', grow: true })}>
                        <Text align='start' variant='label' truncate>
                          {profile.name}
                        </Text>
                        <Text align='start' tone='muted' variant='micro'>
                          {profile.accountCount} {profile.accountCount === 1 ? 'Account' : 'Accounts'}
                        </Text>
                      </div>
                      <Text align='end' variant='numeric' shrink={false}>
                        {profileValue(profile)}
                      </Text>
                      {selected ? <Icon name='check' size='small' tone='accent' /> : null}
                    </Button>
                    <div className={rowRecipe()}>
                      <IconButton
                        appearance='ghost'
                        icon='edit'
                        label={'Rename ' + profile.name}
                        disabled={submitting}
                        onPress={() => openRename(profile)}
                        size='small'
                      />
                      <IconButton
                        appearance='ghost'
                        icon='trash'
                        label={'Delete ' + profile.name}
                        disabled={submitting || profile.accountCount > 0 || profiles.length <= 1}
                        title={deleteHint}
                        onPress={() => {
                          resetManagement()
                          setManagedProfileId(profile.id)
                          setMode('delete')
                        }}
                        size='small'
                      />
                    </div>
                  </div>
                  {managing ? management : null}
                </div>
              )
            })}
            {displayedMode === 'create' ? (
              management
            ) : (
              <Button
                appearance='ghost'
                label='Create profile'
                onPress={() => void openCreate()}
                size='small'
                width='full'
              >
                <Icon name='plus' size='small' />
              </Button>
            )}
            {displayedMode === 'none' && visibleError ? (
              <Text tone='danger' variant='caption'>
                {visibleError}
              </Text>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
