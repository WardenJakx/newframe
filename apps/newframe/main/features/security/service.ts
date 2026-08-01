import type {
  SecurityConfigureCommand,
  SecurityStatusResult,
  SecurityUnlockCommand,
  WalletLockCommand,
  WalletResetCommand
} from '../../../contracts/operations.js'
import type { CanonicalStore } from '../../store/actions.js'
import type { OperationService } from '../operations/service.js'
import type { OperationOwner, OperationReference } from '../operations/types.js'

type BestAvailableConfigureCommand = Extract<SecurityConfigureCommand, { mode: 'best-available' }>
type WebAuthnEnrollment = Extract<BestAvailableConfigureCommand['browser'], { status: 'enrolled' }>
type BiometricSummary = Extract<SecurityStatusResult, { ok: true }>['biometrics']
type SecurityStoreState = Pick<CanonicalStore, 'main' | 'resetSavedData' | 'setBiometricUnlock'>

export interface SecurityServicePorts {
  authentication: {
    lock(): Promise<void>
    unlockWithBiometrics(
      payload: { method: 'native' } | { method: 'webauthn'; secret: string }
    ): Promise<void>
    unlockWithPassword(password: string): Promise<void>
  }
  biometrics: {
    summary(): BiometricSummary
    disable(): void
    enableNative(vaultKey: string): Promise<void>
    enableWebAuthn(vaultKey: string, credential: WebAuthnEnrollment['credential'], secret: string): void
  }
  lifecycle: {
    clearPersistence(): void
    exit(code: number): void
    quitAndInstall(): void
    relaunch(): void
    updateReady(): boolean
  }
  operations: OperationService
  store: { getState(): SecurityStoreState }
  vault: {
    exists(): boolean
    isUnlocked(): boolean
    getKey(): string | null
  }
}

type SecurityOperationCommand =
  | SecurityConfigureCommand
  | SecurityUnlockCommand
  | WalletLockCommand
  | WalletResetCommand

const referenceFor = (command: SecurityOperationCommand, owner: OperationOwner): OperationReference => ({
  owner,
  id: command.operationId,
  type: command.type
})

const knownErrorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : ''

function safeFailure(command: SecurityOperationCommand, error: unknown) {
  const message = knownErrorMessage(error)
  if (command.type === 'security.unlock') {
    if (command.method === 'password' && message === 'Incorrect password') {
      return { code: 'incorrect_password', message: 'Authentication failed.' }
    }
    if (command.method !== 'password') {
      return { code: 'biometric_authentication_failed', message: 'Biometric authentication failed' }
    }
    return { code: 'unlock_failed', message: 'Could not unlock Newframe' }
  }
  if (command.type === 'wallet.lock') {
    return { code: 'lock_failed', message: 'Could not lock Newframe.' }
  }
  if (command.type === 'wallet.reset') {
    return { code: 'reset_failed', message: 'Could not reset Newframe.' }
  }
  if (message === 'Unlock Newframe before enabling biometric login') {
    return { code: 'wallet_locked', message }
  }
  if (message === 'Biometrics are not available on this device') {
    return { code: 'biometrics_unavailable', message }
  }
  return { code: 'biometric_configuration_failed', message: 'Could not enable biometrics.' }
}

export function createSecurityService(ports: SecurityServicePorts) {
  function run(
    command: SecurityOperationCommand,
    owner: OperationOwner,
    phase: string,
    execute: (reference: OperationReference) => Promise<void> | void
  ) {
    const reference = referenceFor(command, owner)
    if (ports.operations.lookup(reference)) return true

    try {
      ports.operations.start({ id: reference.id, type: reference.type, owner, phase })
    } catch {
      return false
    }

    void Promise.resolve()
      .then(() => execute(reference))
      .catch((error) => ports.operations.fail(reference, safeFailure(command, error)))
    return true
  }

  function configureBestAvailable(command: BestAvailableConfigureCommand) {
    if (!ports.vault.isUnlocked()) {
      throw new Error('Unlock Newframe before enabling biometric login')
    }

    const key = ports.vault.getKey()
    if (!key) throw new Error('Unlocked vault did not provide an encryption key')

    if (command.browser.status === 'enrolled') {
      try {
        ports.biometrics.enableWebAuthn(key, command.browser.credential, command.browser.secret)
        return
      } catch {
        // The previous renderer-owned sequence fell back after either browser
        // enrollment or main-side WebAuthn configuration failed. Keep that
        // behavior, but make the capability decision from fresh trusted main state.
        if (!ports.biometrics.summary().nativeAvailable) {
          throw new Error('Could not enable biometrics.')
        }
        return ports.biometrics.enableNative(key)
      }
    }

    if (!ports.biometrics.summary().nativeAvailable) {
      throw new Error(
        command.browser.status === 'unavailable'
          ? 'Biometrics are not available on this device'
          : 'Could not enable biometrics.'
      )
    }
    return ports.biometrics.enableNative(key)
  }

  return {
    status() {
      const appLock = ports.store.getState().main.appLock
      const summary = ports.biometrics.summary()
      const biometricAvailable =
        summary.enabled &&
        (summary.method === 'native' ? summary.nativeAvailable : summary.method === 'webauthn')

      return {
        ...appLock,
        biometricUnlockEnabled: summary.enabled,
        biometricAvailable,
        biometrics: {
          enabled: summary.enabled,
          method: summary.method,
          credential: summary.credential,
          nativeAvailable: summary.nativeAvailable
        }
      }
    },

    configure(command: SecurityConfigureCommand, owner: OperationOwner) {
      return run(command, owner, 'configuring', async (reference) => {
        if (command.mode === 'disabled') {
          ports.biometrics.disable()
          ports.store.getState().setBiometricUnlock(false)
        } else {
          await configureBestAvailable(command)
          ports.store.getState().setBiometricUnlock(true)
        }
        ports.operations.complete(reference, 'completed')
      })
    },

    unlock(command: SecurityUnlockCommand, owner: OperationOwner) {
      return run(command, owner, 'authenticating', async (reference) => {
        if (command.method === 'password') {
          await ports.authentication.unlockWithPassword(command.password)
        } else {
          await ports.authentication.unlockWithBiometrics(
            command.method === 'webauthn'
              ? { method: 'webauthn', secret: command.secret }
              : { method: 'native' }
          )
        }
        ports.operations.complete(reference, 'completed')
      })
    },

    lock(command: WalletLockCommand, owner: OperationOwner) {
      return run(command, owner, 'locking', async (reference) => {
        await ports.authentication.lock()
        ports.operations.complete(reference, 'completed')
      })
    },

    reset(command: WalletResetCommand, owner: OperationOwner) {
      return run(command, owner, 'resetting', (reference) => {
        ports.store.getState().resetSavedData()
        if (command.scope === 'saved-data') {
          ports.operations.complete(reference, 'completed')
          return
        }

        ports.lifecycle.clearPersistence()
        if (ports.lifecycle.updateReady()) {
          ports.lifecycle.quitAndInstall()
        } else {
          ports.lifecycle.relaunch()
          ports.lifecycle.exit(0)
        }
        // A full reset deliberately remains pending: the process is restarting,
        // so the acknowledgement cannot be mistaken for durable completion.
      })
    }
  }
}

export type SecurityService = ReturnType<typeof createSecurityService>
