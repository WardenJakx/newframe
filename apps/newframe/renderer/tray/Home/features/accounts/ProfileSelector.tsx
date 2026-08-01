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
import { useWalletSelector } from '../../../../state/useAppSelector'
import { selectOperationById, selectOperationEntityId } from '../../../../state/selectors/operation'

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
type ProfileSubmission = {
  operationId: string
  type: 'profile.select' | 'profile.create' | 'profile.rename' | 'profile.delete'
  profileId?: string
  name?: string
}

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
  const [submission, setSubmission] = React.useState<ProfileSubmission | null>(null)
  const submissionRef = React.useRef<ProfileSubmission | null>(null)
  const [error, setError] = React.useState('')
  const activeProfile = profiles.find((profile) => profile.id === currentProfile) || profiles[0]
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
      ? errorMessage(trackedOperation.error?.code || '', 'Profile operation failed. Try again.')
      : ''
  const submissionReflected =
    !!submission &&
    trackedOperation?.status === 'succeeded' &&
    (submission.type === 'profile.select'
      ? currentProfile === submission.profileId
      : submission.type === 'profile.create'
        ? !!createdProfileId &&
          currentProfile === createdProfileId &&
          profiles.some((profile) => profile.id === createdProfileId)
        : submission.type === 'profile.rename'
          ? profiles.some(
              (profile) => profile.id === submission.profileId && profile.name === submission.name
            )
          : !profiles.some((profile) => profile.id === submission.profileId))
  const displayedMode = submissionReflected ? 'none' : mode
  const displayedOpen = submissionReflected && submission?.type !== 'profile.rename' ? false : open
  const visibleError = submissionReflected ? '' : operationFailure || error

  const resetManagement = React.useCallback(() => {
    setMode('none')
    setName('')
    setMovableAccounts([])
    setSelectedAccountIds([])
    setLoadingAccounts(false)
    submissionRef.current = null
    setSubmission(null)
    setError('')
  }, [])

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
      if (!nextOpen) resetManagement()
    },
    [resetManagement, submissionReflected]
  )

  const handleSelect = React.useCallback(
    async (profileId: string) => {
      if (profileId === currentProfile) return
      const operationId = crypto.randomUUID()
      const nextSubmission: ProfileSubmission = { operationId, type: 'profile.select', profileId }
      submissionRef.current = nextSubmission
      setSubmission(nextSubmission)
      setOpen(true)
      setError('')
      const result = await link.executeCommand({ type: 'profile.select', operationId, profileId })
      if (!result.ok) {
        setError(errorMessage(result.error, 'Could not switch profiles. Try again.'))
        submissionRef.current = null
        setSubmission(null)
        setOpen(true)
      }
    },
    [currentProfile]
  )

  const openCreate = React.useCallback(async () => {
    if (submissionReflected) resetManagement()
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
  }, [resetManagement, submissionReflected])

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
    const result = await link.executeCommand({
      type: 'profile.create',
      operationId,
      name: trimmedName,
      ...(selectedAccountIds.length ? { accountIds: selectedAccountIds } : {})
    })
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not create the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [name, selectedAccountIds])

  const openRename = React.useCallback(() => {
    if (!activeProfile) return
    if (submissionReflected) resetManagement()
    setMode('rename')
    setName(activeProfile.name)
    setError('')
  }, [activeProfile, resetManagement, submissionReflected])

  const submitRename = React.useCallback(async () => {
    if (!activeProfile) return
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
      setError('Enter a profile name between 1 and 50 characters.')
      return
    }

    const operationId = crypto.randomUUID()
    const nextSubmission: ProfileSubmission = {
      operationId,
      type: 'profile.rename',
      profileId: activeProfile.id,
      name: trimmedName
    }
    submissionRef.current = nextSubmission
    setSubmission(nextSubmission)
    setError('')
    const result = await link.executeCommand({
      type: 'profile.rename',
      operationId,
      profileId: activeProfile.id,
      name: trimmedName
    })
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not rename the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [activeProfile, name])

  const submitDelete = React.useCallback(async () => {
    if (!activeProfile || activeProfile.accountCount > 0 || profiles.length <= 1) return
    const operationId = crypto.randomUUID()
    const nextSubmission: ProfileSubmission = {
      operationId,
      type: 'profile.delete',
      profileId: activeProfile.id
    }
    submissionRef.current = nextSubmission
    setSubmission(nextSubmission)
    setError('')
    const result = await link.executeCommand({
      type: 'profile.delete',
      operationId,
      profileId: activeProfile.id
    })
    if (!result.ok) {
      setError(errorMessage(result.error, 'Could not delete the profile. Try again.'))
      submissionRef.current = null
      setSubmission(null)
    }
  }, [activeProfile, profiles.length])

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
        {displayedMode === 'create' ? (
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
        ) : displayedMode === 'rename' ? (
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
        ) : displayedMode === 'delete' ? (
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
                if (submissionReflected) resetManagement()
                setMode('delete')
                setError('')
              }}
              size='small'
            >
              <Text variant='caption'>Delete</Text>
            </Button>
          </div>
        )}
        {visibleError ? (
          <Text tone='danger' variant='caption'>
            {visibleError}
          </Text>
        ) : null}
        {displayedMode === 'none' && activeProfile?.accountCount ? (
          <Text tone='muted' variant='micro'>
            Move all accounts before deleting this profile.
          </Text>
        ) : null}
        {displayedMode === 'none' && profiles.length <= 1 ? (
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
      open={displayedOpen}
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
