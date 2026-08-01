import type { SecurityServicePorts } from '../../features/security/service.js'
import { createOneResultCallbackBoundary } from '../callbacks/oneResult.js'

type SecurityCallback = (error: Error | null, value?: boolean) => void

export interface ProductionSecurityExternalAdapters {
  app: Pick<Electron.App, 'exit' | 'relaunch'>
  biometrics: SecurityServicePorts['biometrics']
  persistence: { clear(): void }
  signers: {
    lockApp(callback: SecurityCallback): void
    unlockApp(password: string, callback: SecurityCallback): void
    unlockAppWithBiometrics(
      payload: { method: 'native' } | { method: 'webauthn'; secret: string },
      callback: SecurityCallback
    ): void
  }
  updater: {
    quitAndInstall(): void
    updateReady: boolean
  }
  vault: SecurityServicePorts['vault']
}

export function createProductionSecurityAdapters(
  external: ProductionSecurityExternalAdapters
): Omit<SecurityServicePorts, 'operations' | 'store'> & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: callbacks.dispose,
    authentication: {
      lock: async () => {
        await callbacks.run<true>((done) => external.signers.lockApp((error) => done(error, true)))
      },
      unlockWithBiometrics: async (payload) => {
        await callbacks.run<boolean>((done) => external.signers.unlockAppWithBiometrics(payload, done))
      },
      unlockWithPassword: async (password) => {
        await callbacks.run<boolean>((done) => external.signers.unlockApp(password, done))
      }
    },
    biometrics: external.biometrics,
    lifecycle: {
      clearPersistence: () => external.persistence.clear(),
      exit: (code) => external.app.exit(code),
      quitAndInstall: () => external.updater.quitAndInstall(),
      relaunch: () => external.app.relaunch(),
      updateReady: () => external.updater.updateReady
    },
    vault: external.vault
  }
}
