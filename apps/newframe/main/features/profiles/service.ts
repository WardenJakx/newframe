import { randomUUID } from 'node:crypto'

import type {
  AccountProfileMoveCommand,
  ProfileCreateCommand,
  ProfileDeleteCommand,
  ProfileRenameCommand,
  ProfileSelectCommand
} from '../../../contracts/operations.js'
import type { OperationEntityRef } from '../../../domain/state/operation.js'
import type { CanonicalStore } from '../../store/actions.js'
import type { OperationService } from '../operations/service.js'
import type { OperationOwner, OperationReference } from '../operations/types.js'

type ProfileCommand =
  | AccountProfileMoveCommand
  | ProfileCreateCommand
  | ProfileDeleteCommand
  | ProfileRenameCommand
  | ProfileSelectCommand

type ProfileState = Pick<
  CanonicalStore,
  'main' | 'createProfile' | 'deleteProfile' | 'moveAccountToProfile' | 'renameProfile' | 'selectProfile'
>

interface ProfileAccount {
  id: string
  address: string
  name: string
}

export interface ProfileServicePorts {
  accounts: { get(accountId: string): ProfileAccount | null | undefined }
  operations: OperationService
  provider: { accountsChanged(addresses: string[]): void }
  store: { getState(): ProfileState }
  createProfileId?: () => string
}

const normalizedProfileName = (name: string) => name.trim()
const profileNameKey = (name: string) => normalizedProfileName(name).toLowerCase()

function selectedAddress(ports: ProfileServicePorts) {
  const currentAccount = ports.store.getState().main.currentAccount
  return ports.accounts.get(currentAccount)?.address || ''
}

function publishSelectedAddressChange(previousAddress: string, ports: ProfileServicePorts) {
  const nextAddress = selectedAddress(ports)
  if (nextAddress !== previousAddress) ports.provider.accountsChanged(nextAddress ? [nextAddress] : [])
}

function profileNameError(name: string, state: ProfileState, excludedProfileId = '') {
  const normalized = normalizedProfileName(name)
  if (!normalized || normalized.length > 50) return 'invalid_name'
  if (
    Object.values(state.main.profiles).some(
      (profile) =>
        profile.id !== excludedProfileId && profileNameKey(profile.name) === profileNameKey(normalized)
    )
  ) {
    return 'duplicate_name'
  }
}

const failureMessages: Record<string, string> = {
  account_not_found: 'That account is no longer available.',
  duplicate_name: 'A profile with that name already exists.',
  final_profile: 'Keep at least one profile.',
  invalid_name: 'Enter a profile name between 1 and 50 characters.',
  invalid_profile: 'That profile is invalid.',
  profile_not_empty: 'Move or remove every account before deleting this profile.',
  profile_not_found: 'That profile is no longer available.',
  same_profile: 'The account is already in that profile.'
}

export function createProfileService(ports: ProfileServicePorts) {
  const createProfileId = ports.createProfileId ?? randomUUID

  function run(
    command: ProfileCommand,
    owner: OperationOwner,
    entityRefs: OperationEntityRef[],
    apply: () => string | undefined
  ) {
    const reference: OperationReference = { owner, id: command.operationId, type: command.type }
    if (ports.operations.lookup(reference)) return true

    try {
      ports.operations.start({
        id: reference.id,
        type: reference.type,
        owner,
        phase: 'applying',
        entityRefs
      })
    } catch {
      // An existing ID owned by another principal or semantic operation must
      // never be overwritten or used to mutate profile state.
      return false
    }

    try {
      const error = apply()
      if (error) {
        ports.operations.fail(reference, {
          code: error,
          message: failureMessages[error] || 'Profile operation failed.'
        })
        return true
      }
      ports.operations.complete(reference, 'completed')
    } catch {
      ports.operations.fail(reference, {
        code: 'operation_failed',
        message: 'Profile operation failed.'
      })
    }

    return true
  }

  return {
    select(command: ProfileSelectCommand, owner: OperationOwner) {
      return run(command, owner, [{ type: 'profile', id: command.profileId }], () => {
        const state = ports.store.getState()
        const profile = state.main.profiles[command.profileId]
        if (!profile) return 'profile_not_found'
        if (profile.id !== command.profileId) return 'invalid_profile'

        const previousAddress = selectedAddress(ports)
        state.selectProfile(command.profileId)
        publishSelectedAddressChange(previousAddress, ports)
      })
    },

    create(command: ProfileCreateCommand, owner: OperationOwner) {
      const reference: OperationReference = { owner, id: command.operationId, type: command.type }
      if (ports.operations.lookup(reference)) return

      const state = ports.store.getState()
      let profileId = createProfileId()
      while (state.main.profiles[profileId]) profileId = createProfileId()

      return run(command, owner, [{ type: 'profile', id: profileId }], () => {
        const current = ports.store.getState()
        const normalizedName = normalizedProfileName(command.name)
        const nameError = profileNameError(normalizedName, current)
        if (nameError) return nameError

        const accountIds = command.accountIds || []
        if (accountIds.some((accountId) => !ports.accounts.get(accountId))) return 'account_not_found'

        const previousAddress = selectedAddress(ports)
        current.createProfile(profileId, normalizedName, accountIds)
        publishSelectedAddressChange(previousAddress, ports)
      })
    },

    rename(command: ProfileRenameCommand, owner: OperationOwner) {
      return run(command, owner, [{ type: 'profile', id: command.profileId }], () => {
        const state = ports.store.getState()
        const profile = state.main.profiles[command.profileId]
        if (!profile) return 'profile_not_found'
        if (profile.id !== command.profileId) return 'invalid_profile'

        const normalizedName = normalizedProfileName(command.name)
        const nameError = profileNameError(normalizedName, state, command.profileId)
        if (nameError) return nameError
        state.renameProfile(command.profileId, normalizedName)
      })
    },

    delete(command: ProfileDeleteCommand, owner: OperationOwner) {
      return run(command, owner, [{ type: 'profile', id: command.profileId }], () => {
        const state = ports.store.getState()
        const profile = state.main.profiles[command.profileId]
        if (!profile) return 'profile_not_found'
        if (profile.id !== command.profileId) return 'invalid_profile'
        if (state.main.profileOrder.length === 1) return 'final_profile'
        if (Object.values(state.main.accounts).some((account) => account.profileId === command.profileId)) {
          return 'profile_not_empty'
        }

        const previousAddress = selectedAddress(ports)
        state.deleteProfile(command.profileId)
        publishSelectedAddressChange(previousAddress, ports)
      })
    },

    moveAccount(command: AccountProfileMoveCommand, owner: OperationOwner) {
      return run(
        command,
        owner,
        [
          { type: 'account', id: command.accountId },
          { type: 'profile', id: command.profileId }
        ],
        () => {
          const state = ports.store.getState()
          const account = ports.accounts.get(command.accountId)
          if (!account) return 'account_not_found'
          const profile = state.main.profiles[command.profileId]
          if (!profile) return 'profile_not_found'
          if (profile.id !== command.profileId) return 'invalid_profile'
          if (state.main.accounts[command.accountId]?.profileId === command.profileId) return 'same_profile'

          const previousAddress = selectedAddress(ports)
          state.moveAccountToProfile(command.accountId, command.profileId)
          publishSelectedAddressChange(previousAddress, ports)
        }
      )
    },

    movableAccounts() {
      const { main } = ports.store.getState()
      const seen = new Set<string>()
      const accounts = [...main.accountOrder, ...Object.keys(main.accounts)].flatMap((id) => {
        if (seen.has(id)) return []
        const account = ports.accounts.get(id)
        const canonicalAccount = main.accounts[id]
        if (!account || !canonicalAccount) return []
        seen.add(id)
        return [
          {
            id: account.id,
            address: account.address,
            name: account.name,
            profileId: canonicalAccount.profileId
          }
        ]
      })
      return { ok: true, accounts } as const
    }
  }
}

export type ProfileService = ReturnType<typeof createProfileService>
