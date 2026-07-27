import type {
  SecurityConfigureCommand,
  SecurityStatusResult,
  SecurityUnlockCommand
} from '../../../contracts/operations'
import type { CanonicalStore } from '../../store/actions'

type WebAuthnConfigureCommand = Extract<SecurityConfigureCommand, { mode: 'webauthn' }>
type BiometricSummary = Extract<SecurityStatusResult, { ok: true }>['biometrics']
type SecurityStoreState = Pick<CanonicalStore, 'main' | 'setBiometricUnlock'>
type SecurityCallback = (error: Error | null, value?: boolean) => void

export interface SecurityServicePorts {
  biometrics: {
    summary(): BiometricSummary
    disable(): void
    enableNative(vaultKey: string): Promise<void>
    enableWebAuthn(vaultKey: string, credential: WebAuthnConfigureCommand['credential'], secret: string): void
  }
  signers: {
    unlockApp(password: string, callback: SecurityCallback): void
    unlockAppWithBiometrics(
      payload: { method: 'native' } | { method: 'webauthn'; secret: string },
      callback: SecurityCallback
    ): void
    lockApp(callback: SecurityCallback): void
  }
  store: { getState(): SecurityStoreState }
  vault: {
    isUnlocked(): boolean
    getKey(): string | null
  }
}

function callbackResult<T>(run: (done: (error: unknown, value?: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => {
      if (error) return reject(error)
      if (value === undefined) return reject(new Error('Operation returned no result'))
      resolve(value)
    })
  })
}

export function createSecurityService(ports: SecurityServicePorts) {
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

    async configure(command: SecurityConfigureCommand) {
      if (command.mode === 'disabled') {
        ports.biometrics.disable()
        ports.store.getState().setBiometricUnlock(false)
        return
      }
      if (!ports.vault.isUnlocked()) {
        throw new Error('Unlock Newframe before enabling biometric login')
      }

      const key = ports.vault.getKey()
      if (!key) throw new Error('Unlocked vault did not provide an encryption key')
      if (command.mode === 'native') await ports.biometrics.enableNative(key)
      else ports.biometrics.enableWebAuthn(key, command.credential, command.secret)
      ports.store.getState().setBiometricUnlock(true)
    },

    async unlock(command: SecurityUnlockCommand) {
      await callbackResult<boolean>((done) => {
        if (command.method === 'password') return ports.signers.unlockApp(command.password, done)
        ports.signers.unlockAppWithBiometrics(
          command.method === 'webauthn'
            ? { method: 'webauthn', secret: command.secret }
            : { method: 'native' },
          done
        )
      })
    },

    lock() {
      return new Promise<void>((resolve, reject) => {
        ports.signers.lockApp((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}
