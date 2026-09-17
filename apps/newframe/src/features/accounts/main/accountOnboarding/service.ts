import { isAddress } from 'ethers'

import type {
  AccountCreateCommand,
  SignerDisconnectCommand,
  SignerSessionFinishCommand,
  SignerSessionStartCommand,
  SignerImportCommand,
  SignerRefreshCommand,
  SignerSessionInputCommand
} from '../../../../app/contracts/operations.js'
import type { OperationEntityRef } from '../../../../platform/operations/operation.js'
import type { OperationService } from '../../../../platform/operations/service.js'
import type { OperationOwner, OperationReference } from '../../../../platform/operations/types.js'
import { getSignerDisplayType } from '../../../../platform/signing/domain/index.js'
import { capitalize } from '../../../../shared/domain/text.js'

export type OnboardingSigner = {
  id: string
  type: string
  addresses: string[]
  status?: string
}

type CreateAccountCommand = Exclude<AccountCreateCommand, { source: 'safe' }>
type ImportSignerCommand = Exclude<SignerImportCommand, { source: 'airgap' }>
type SecretImportCommand = Extract<SignerImportCommand, { source: 'phrase' | 'private-key' | 'keystore' }>
type HardwareInputCommand = Extract<SignerSessionInputCommand, { input: string }>
type HardwareFinishCommand = Extract<SignerSessionFinishCommand, { outcome: string }>

export interface AccountOnboardingPorts {
  accounts: {
    add(address: string, name: string, signer: { type: string }): void
    get(accountId: string): unknown
    select(accountId: string): Promise<void>
  }
  hardware: {
    configureLattice(deviceId: string, deviceName: string): string
    loadAccounts(signerId: string, accountCount: number): boolean
    pairLattice(signerId: string, pairCode: string): Promise<boolean>
    submitTrezorInput(command: Exclude<HardwareInputCommand, { input: 'pair-code' }>): boolean
  }
  keystore: { locate(): Promise<Record<string, unknown> | undefined> }
  nameResolution: { resolve(name: string): Promise<string | undefined> }
  operations: OperationService
  signers: {
    create(command: SecretImportCommand): Promise<OnboardingSigner>
    get(signerId: string): OnboardingSigner | undefined
    reload(signerId: string): boolean
    remove(signerId: string): boolean
  }
  secrets: {
    exportPrivateKey(address: string): Promise<{ type: string; value: string }>
    generateSeedPhrase(): Promise<string>
  }
}

type OnboardingOperationCommand =
  | CreateAccountCommand
  | ImportSignerCommand
  | SignerDisconnectCommand
  | SignerRefreshCommand
  | HardwareInputCommand
const operationType = (command: OnboardingOperationCommand) => {
  if (command.type === 'account.create') {
    return command.source === 'watch' ? 'account.watch-add' : 'account.add-from-signer'
  }
  if (command.type === 'signer.import') {
    return `signer.import.${command.source}`
  }
  if (command.type === 'signer.refresh') {
    return 'signer.accounts-load'
  }
  if (command.type === 'signer.session-input') {
    return `signer.session-input.${command.input}`
  }
  return command.type
}

const hardwareSessionType = 'signer.hardware-session'

const safeFailure: Record<string, { code: string; message: string }> = {
  'account.add-from-signer': { code: 'account_not_found', message: 'Signer account was not found.' },
  'account.watch-add': { code: 'address_not_found', message: 'Address or name was not found.' },
  'signer.import': { code: 'signer_import_failed', message: 'Could not import the signer.' },
  'signer.lattice-create': { code: 'signer_configuration_failed', message: 'Could not create the signer.' },
  'signer.disconnect': { code: 'signer_not_found', message: 'Signer was not found.' },
  'signer.hardware-session-start': {
    code: 'signer_not_found',
    message: 'Hardware signer was not found.'
  },
  'signer.ledger-accounts-load': {
    code: 'signer_not_found',
    message: 'Could not load Ledger accounts.'
  },
  'signer.lattice-pair': { code: 'signer_pair_failed', message: 'Could not pair GridPlus.' },
  'signer.reload': { code: 'signer_not_found', message: 'Could not reconnect the signer.' },
  'signer.trezor-input': { code: 'signer_input_failed', message: 'Could not submit device input.' }
}

export interface AccountOnboardingService {
  createAccount(command: CreateAccountCommand, owner: OperationOwner): boolean
  disconnect(command: SignerDisconnectCommand, owner: OperationOwner): boolean
  finishSession(command: HardwareFinishCommand, owner: OperationOwner): boolean
  importSigner(command: ImportSignerCommand, owner: OperationOwner): boolean
  refresh(command: SignerRefreshCommand, owner: OperationOwner): boolean
  locateKeystore(): Promise<Record<string, unknown> | undefined>
  exportPrivateKey(accountId: string): Promise<string | undefined>
  generateSeedPhrase(): Promise<string>
  startSession(command: SignerSessionStartCommand, owner: OperationOwner): boolean
  sessionInput(command: HardwareInputCommand, owner: OperationOwner): boolean
}

export function createAccountOnboardingService(ports: AccountOnboardingPorts): AccountOnboardingService {
  const reference = (command: OnboardingOperationCommand, owner: OperationOwner) => ({
    id: 'actionId' in command ? command.actionId : command.operationId,
    type: operationType(command),
    owner
  })

  const failureType = (command: OnboardingOperationCommand) => {
    if (command.type === 'account.create') {
      return operationType(command)
    }
    if (command.type === 'signer.refresh') {
      return 'signer.ledger-accounts-load'
    }
    if (command.type === 'signer.session-input') {
      return command.input === 'pair-code' ? 'signer.lattice-pair' : 'signer.trezor-input'
    }
    return command.type
  }
  const run = (
    operationReference: OperationReference,
    phase: string,
    failure: string,
    execute: () =>
      | Promise<{ phase: string; entityRefs?: OperationEntityRef[] }>
      | { phase: string; entityRefs?: OperationEntityRef[] },
    entityRefs?: OperationEntityRef[],
    keepPending = false
  ) => {
    if (ports.operations.lookup(operationReference)) {
      return true
    }
    try {
      ports.operations.start({ ...operationReference, phase, ...(entityRefs ? { entityRefs } : {}) })
    } catch {
      return false
    }
    const runOperation = async () => {
      try {
        const result = await execute()
        if (result.entityRefs) {
          ports.operations.advance(operationReference, result)
        }
        if (!keepPending) {
          ports.operations.complete(operationReference, result.phase)
        }
      } catch {
        ports.operations.fail(operationReference, safeFailure[failure], 'failed')
      }
    }
    queueMicrotask(() => {
      void runOperation()
    })
    return true
  }

  const sessionReference = (operationId: string, owner: OperationOwner) => ({
    id: operationId,
    type: hardwareSessionType,
    owner
  })

  const startSession = (
    operationId: string,
    signerId: string | undefined,
    owner: OperationOwner,
    phase: string,
    failure: string,
    execute: () => Promise<string> | string
  ) =>
    run(
      sessionReference(operationId, owner),
      phase,
      failure,
      async () => ({
        phase,
        entityRefs: [{ type: 'signer', id: await execute() }]
      }),
      signerId ? [{ type: 'signer', id: signerId }] : undefined,
      true
    )

  const ownedSession = (operationId: string, signerId: string, owner: OperationOwner) => {
    const session = sessionReference(operationId, owner)
    const operation = ports.operations.lookup(session)
    if (
      operation?.status !== 'pending' ||
      !operation.entityRefs?.some((ref) => ref.type === 'signer' && ref.id === signerId)
    ) {
      return
    }
    return session
  }

  const runHardwareAction = (
    command: HardwareInputCommand,
    owner: OperationOwner,
    phase: string,
    execute: () => Promise<boolean> | boolean
  ) => {
    const session = ownedSession(command.operationId, command.signerId, owner)
    if (!session) {
      return false
    }
    return run(
      reference(command, owner),
      phase,
      failureType(command),
      async () => {
        try {
          if (!(await execute())) {
            throw new Error('Hardware action was rejected')
          }
          ports.operations.advance(session, { phase })
          return { phase: 'accepted' }
        } catch (error) {
          ports.operations.fail(session, safeFailure[failureType(command)], 'failed')
          throw error
        }
      },
      [{ type: 'signer', id: command.signerId }]
    )
  }

  const addAndSelect = async (address: string, name: string, signerType: string) => {
    const accountId = address.toLowerCase()
    if (!ports.accounts.get(accountId)) {
      ports.accounts.add(address, name, { type: signerType })
    }
    await ports.accounts.select(accountId)
    return accountId
  }

  return {
    async exportPrivateKey(accountId) {
      const account = ports.accounts.get(accountId) as { address?: string } | undefined
      if (!account?.address) {
        return
      }
      const secret = await ports.secrets.exportPrivateKey(account.address)
      if (secret.type !== 'privateKey') {
        throw new Error('Private key was not returned')
      }
      return secret.value
    },
    generateSeedPhrase: () => ports.secrets.generateSeedPhrase(),
    createAccount(command, owner) {
      return run(
        reference(command, owner),
        command.source === 'watch' ? 'resolving_address' : 'adding_account',
        failureType(command),
        async () => {
          const signer = command.source === 'signer' ? ports.signers.get(command.signerId) : undefined
          const address =
            command.source === 'signer'
              ? signer?.addresses.find(
                  (candidate) => candidate.toLowerCase() === command.address.toLowerCase()
                )
              : isAddress(command.addressOrName)
                ? command.addressOrName
                : await ports.nameResolution.resolve(command.addressOrName)
          if (!address || !isAddress(address) || (command.source === 'signer' && !signer)) {
            throw new Error('Account not found')
          }
          const name = signer ? `${capitalize(getSignerDisplayType(signer.type))} Account` : 'Watch Account'
          const accountId = await addAndSelect(address, command.name || name, signer?.type || 'Address')
          return {
            phase: 'selected',
            entityRefs: [
              ...(signer ? [{ type: 'signer' as const, id: signer.id }] : []),
              { type: 'account', id: accountId }
            ]
          }
        }
      )
    },
    disconnect(command, owner) {
      return run(reference(command, owner), 'disconnecting', failureType(command), () => {
        if (!ports.signers.remove(command.signerId)) {
          throw new Error('Signer not found')
        }
        return { phase: 'disconnected', entityRefs: [{ type: 'signer', id: command.signerId }] }
      })
    },
    finishSession(command, owner) {
      const session = ownedSession(command.operationId, command.signerId, owner)
      if (!session) {
        return false
      }
      if (
        command.outcome === 'ready' &&
        ports.signers.get(command.signerId)?.status?.toLowerCase() !== 'ok'
      ) {
        return false
      }
      ports.operations.complete(session, command.outcome)
      return true
    },
    importSigner(command, owner) {
      if (command.source === 'lattice') {
        return startSession(
          command.operationId,
          undefined,
          owner,
          'connecting',
          'signer.lattice-create',
          () => ports.hardware.configureLattice(command.deviceId, command.deviceName)
        )
      }
      return run(reference(command, owner), 'importing', failureType(command), async () => {
        const signer = await ports.signers.create(command)
        const address = signer.addresses[0]
        if (!address) {
          throw new Error('No account address was created')
        }
        const accountId = await addAndSelect(address, command.accountName || 'Hot Account', signer.type)
        return {
          phase: 'selected',
          entityRefs: [
            { type: 'signer', id: signer.id },
            { type: 'account', id: accountId }
          ]
        }
      })
    },
    refresh(command, owner) {
      if (command.accountCount === undefined) {
        return startSession(
          command.operationId,
          command.signerId,
          owner,
          'connecting',
          'signer.reload',
          () => {
            if (!ports.signers.reload(command.signerId)) {
              throw new Error('Signer not found')
            }
            return command.signerId
          }
        )
      }
      const accountCount = command.accountCount
      return run(reference(command, owner), 'deriving', failureType(command), () => {
        if (!ports.hardware.loadAccounts(command.signerId, accountCount)) {
          throw new Error('Signer not found')
        }
        return { phase: 'requested', entityRefs: [{ type: 'signer', id: command.signerId }] }
      })
    },
    locateKeystore: () => ports.keystore.locate(),
    startSession(command, owner) {
      return startSession(
        command.operationId,
        command.signerId,
        owner,
        'awaiting_device',
        'signer.hardware-session-start',
        () => {
          const signer = ports.signers.get(command.signerId)
          if (!signer || !['ledger', 'trezor', 'lattice', 'airgap'].includes(signer.type)) {
            throw new Error('Hardware signer not found')
          }
          return command.signerId
        }
      )
    },
    sessionInput(command, owner) {
      if (command.input === 'pair-code') {
        return runHardwareAction(command, owner, 'pairing', () =>
          ports.hardware.pairLattice(command.signerId, command.value)
        )
      }
      const phase =
        command.input === 'pin'
          ? 'pin_submitted'
          : command.input === 'passphrase'
            ? 'passphrase_submitted'
            : 'device_passphrase_selected'
      return runHardwareAction(command, owner, phase, () => ports.hardware.submitTrezorInput(command))
    }
  }
}
