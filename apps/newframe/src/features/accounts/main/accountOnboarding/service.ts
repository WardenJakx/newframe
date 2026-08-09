import { isAddress } from 'ethers'

import type {
  AccountAddFromSignerCommand,
  AccountWatchAddCommand,
  LatticePairCommand,
  SignerDisconnectCommand,
  SignerHardwareSessionFinishCommand,
  SignerHardwareSessionStartCommand,
  SignerImportCommand,
  SignerLatticeCreateCommand,
  SignerLedgerAccountsLoadCommand,
  SignerReloadCommand,
  TrezorInputCommand
} from '../../../../app/contracts/operations.js'
import type { OperationEntityRef } from '../../../../platform/operations/operation.js'
import { getSignerDisplayType } from '../../../../platform/signing/domain/index.js'
import { capitalize } from '../../../../shared/domain/text.js'
import type { OperationService } from '../../../../platform/operations/service.js'
import type { OperationOwner } from '../../../../platform/operations/types.js'

export type OnboardingSigner = {
  id: string
  type: string
  addresses: string[]
  status?: string
}

export interface AccountOnboardingPorts {
  accounts: {
    add(address: string, name: string, signer: { type: string }): void
    get(accountId: string): unknown
    select(accountId: string): Promise<void>
  }
  hardware: {
    configureLattice(deviceId: string, deviceName: string): string
    loadLedgerAccounts(signerId: string, accountCount: number): boolean
    pairLattice(signerId: string, pairCode: string): Promise<boolean>
    submitTrezorInput(command: TrezorInputCommand): boolean
  }
  keystore: { locate(): Promise<Record<string, unknown> | undefined> }
  nameResolution: { resolve(name: string): Promise<string | undefined> }
  operations: OperationService
  signers: {
    create(command: SignerImportCommand): Promise<OnboardingSigner>
    get(signerId: string): OnboardingSigner | undefined
    reload(signerId: string): boolean
    remove(signerId: string): boolean
  }
  secrets: {
    exportPrivateKey(address: string, password: string): Promise<{ type: string; value: string }>
    generateSeedPhrase(): Promise<string>
  }
}

type OnboardingOperationCommand =
  | AccountAddFromSignerCommand
  | AccountWatchAddCommand
  | SignerImportCommand
  | SignerLatticeCreateCommand
  | SignerDisconnectCommand
  | SignerLedgerAccountsLoadCommand
  | LatticePairCommand
  | SignerReloadCommand
  | TrezorInputCommand

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
  addFromSigner(command: AccountAddFromSignerCommand, owner: OperationOwner): boolean
  addWatch(command: AccountWatchAddCommand, owner: OperationOwner): boolean
  disconnect(command: SignerDisconnectCommand, owner: OperationOwner): boolean
  finishHardwareSession(command: SignerHardwareSessionFinishCommand, owner: OperationOwner): boolean
  importSigner(command: SignerImportCommand, owner: OperationOwner): boolean
  loadLedgerAccounts(command: SignerLedgerAccountsLoadCommand, owner: OperationOwner): boolean
  locateKeystore(): Promise<Record<string, unknown> | undefined>
  exportPrivateKey(accountId: string, password: string): Promise<string | undefined>
  generateSeedPhrase(): Promise<string>
  pairLattice(command: LatticePairCommand, owner: OperationOwner): boolean
  reload(command: SignerReloadCommand, owner: OperationOwner): boolean
  startHardwareSession(command: SignerHardwareSessionStartCommand, owner: OperationOwner): boolean
  createLattice(command: SignerLatticeCreateCommand, owner: OperationOwner): boolean
  submitTrezorInput(command: TrezorInputCommand, owner: OperationOwner): boolean
}

export function createAccountOnboardingService(ports: AccountOnboardingPorts): AccountOnboardingService {
  const reference = (command: OnboardingOperationCommand, owner: OperationOwner) => ({
    id: command.operationId,
    type: command.type,
    owner
  })

  const run = (
    command: OnboardingOperationCommand,
    owner: OperationOwner,
    phase: string,
    execute: () =>
      | Promise<{ phase: string; entityRefs?: OperationEntityRef[] }>
      | {
          phase: string
          entityRefs?: OperationEntityRef[]
        }
  ) => {
    const operationReference = reference(command, owner)
    if (ports.operations.lookup(operationReference)) return true
    try {
      ports.operations.start({ id: command.operationId, type: command.type, owner, phase })
    } catch {
      return false
    }

    queueMicrotask(async () => {
      try {
        const result = await execute()
        if (result.entityRefs) {
          ports.operations.advance(operationReference, {
            phase: result.phase,
            entityRefs: result.entityRefs
          })
        }
        ports.operations.complete(operationReference, result.phase)
      } catch {
        ports.operations.fail(operationReference, safeFailure[command.type], 'failed')
      }
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
    failureType: 'signer.reload' | 'signer.lattice-create' | 'signer.hardware-session-start',
    execute: () => Promise<string> | string
  ) => {
    const session = sessionReference(operationId, owner)
    if (ports.operations.lookup(session)) return true
    try {
      ports.operations.start({
        id: operationId,
        type: hardwareSessionType,
        owner,
        phase,
        ...(signerId ? { entityRefs: [{ type: 'signer', id: signerId }] } : {})
      })
    } catch {
      return false
    }

    queueMicrotask(async () => {
      try {
        const resolvedSignerId = await execute()
        ports.operations.advance(session, {
          phase,
          entityRefs: [{ type: 'signer', id: resolvedSignerId }]
        })
      } catch {
        ports.operations.fail(session, safeFailure[failureType], 'failed')
      }
    })
    return true
  }

  const ownedSession = (operationId: string, signerId: string, owner: OperationOwner) => {
    const session = sessionReference(operationId, owner)
    const operation = ports.operations.lookup(session)
    if (
      !operation ||
      operation.status !== 'pending' ||
      !operation.entityRefs?.some((ref) => ref.type === 'signer' && ref.id === signerId)
    ) {
      return
    }
    return session
  }

  const runHardwareAction = (
    command: LatticePairCommand | TrezorInputCommand,
    owner: OperationOwner,
    phase: string,
    execute: () => Promise<boolean> | boolean
  ) => {
    const session = ownedSession(command.operationId, command.signerId, owner)
    if (!session) return false
    const actionReference = { id: command.actionId, type: command.type, owner }
    if (ports.operations.lookup(actionReference)) return true
    try {
      ports.operations.start({
        id: command.actionId,
        type: command.type,
        owner,
        phase,
        entityRefs: [{ type: 'signer', id: command.signerId }]
      })
    } catch {
      return false
    }

    queueMicrotask(async () => {
      try {
        if (!(await execute())) throw new Error('Hardware action was rejected')
        ports.operations.advance(session, { phase })
        ports.operations.complete(actionReference, 'accepted')
      } catch {
        ports.operations.fail(actionReference, safeFailure[command.type], 'failed')
        ports.operations.fail(session, safeFailure[command.type], 'failed')
      }
    })
    return true
  }

  const addAndSelect = async (address: string, name: string, signerType: string) => {
    const accountId = address.toLowerCase()
    if (!ports.accounts.get(accountId)) ports.accounts.add(address, name, { type: signerType })
    await ports.accounts.select(accountId)
    return accountId
  }

  return {
    async exportPrivateKey(accountId, password) {
      const account = ports.accounts.get(accountId) as { address?: string } | undefined
      if (!account?.address) return
      const secret = await ports.secrets.exportPrivateKey(account.address, password)
      if (secret.type !== 'privateKey') throw new Error('Private key was not returned')
      return secret.value
    },
    generateSeedPhrase: () => ports.secrets.generateSeedPhrase(),
    addFromSigner(command, owner) {
      return run(command, owner, 'adding_account', async () => {
        const signer = ports.signers.get(command.signerId)
        const address = signer?.addresses.find(
          (candidate) => candidate.toLowerCase() === command.address.toLowerCase()
        )
        if (!signer || !address) throw new Error('Signer account not found')
        const accountId = await addAndSelect(
          address,
          command.name || `${capitalize(getSignerDisplayType(signer.type))} Account`,
          signer.type
        )
        return {
          phase: 'selected',
          entityRefs: [
            { type: 'signer', id: signer.id },
            { type: 'account', id: accountId }
          ]
        }
      })
    },
    addWatch(command, owner) {
      return run(command, owner, 'resolving_address', async () => {
        const address = isAddress(command.addressOrName)
          ? command.addressOrName
          : await ports.nameResolution.resolve(command.addressOrName)
        if (!address || !isAddress(address)) throw new Error('Address not found')
        const accountId = await addAndSelect(address, command.name || 'Watch Account', 'Address')
        return { phase: 'selected', entityRefs: [{ type: 'account', id: accountId }] }
      })
    },
    disconnect(command, owner) {
      return run(command, owner, 'disconnecting', () => {
        if (!ports.signers.remove(command.signerId)) throw new Error('Signer not found')
        return { phase: 'disconnected', entityRefs: [{ type: 'signer', id: command.signerId }] }
      })
    },
    finishHardwareSession(command, owner) {
      const session = ownedSession(command.operationId, command.signerId, owner)
      if (!session) return false
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
      return run(command, owner, 'importing', async () => {
        const signer = await ports.signers.create(command)
        const address = signer.addresses[0]
        if (!address) throw new Error('No account address was created')
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
    loadLedgerAccounts(command, owner) {
      return run(command, owner, 'deriving', () => {
        if (!ports.hardware.loadLedgerAccounts(command.signerId, command.accountCount)) {
          throw new Error('Ledger signer not found')
        }
        return { phase: 'requested', entityRefs: [{ type: 'signer', id: command.signerId }] }
      })
    },
    locateKeystore: () => ports.keystore.locate(),
    pairLattice(command, owner) {
      return runHardwareAction(command, owner, 'pairing', () =>
        ports.hardware.pairLattice(command.signerId, command.pairCode)
      )
    },
    reload(command, owner) {
      return startSession(command.operationId, command.signerId, owner, 'connecting', 'signer.reload', () => {
        if (!ports.signers.reload(command.signerId)) throw new Error('Signer not found')
        return command.signerId
      })
    },
    createLattice(command, owner) {
      return startSession(command.operationId, undefined, owner, 'connecting', 'signer.lattice-create', () =>
        ports.hardware.configureLattice(command.deviceId, command.deviceName)
      )
    },
    startHardwareSession(command, owner) {
      return startSession(
        command.operationId,
        command.signerId,
        owner,
        'awaiting_device',
        'signer.hardware-session-start',
        () => {
          const signer = ports.signers.get(command.signerId)
          if (!signer || !['ledger', 'trezor', 'lattice'].includes(signer.type)) {
            throw new Error('Hardware signer not found')
          }
          return command.signerId
        }
      )
    },
    submitTrezorInput(command, owner) {
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
