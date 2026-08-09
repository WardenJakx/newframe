import { describe, expect, it, mock } from 'bun:test'

import type { SecurityServicePorts } from './service'
import { createSecurityService } from './service'
import { createTestStore } from '../../../../test/support/createTestStore'
import { createOperationService } from '../../../platform/operations/service'
import { createProductionSecurityAdapters } from './production'

const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'security-test' }
const flush = () => new Promise((resolve) => setImmediate(resolve))

function harness(overrides: Partial<SecurityServicePorts> = {}) {
  const testStore = createTestStore({
    main: {
      appLock: { locked: true, vaultExists: true },
      biometricUnlock: false,
      assetRates: { token: { usdRate: 2, source: 'zerion', observedAt: 1 } },
      tokens: { byId: {}, accountTokenIds: {} },
      balances: {},
      activity: {},
      orders: {}
    }
  })
  let now = 1
  const ports: SecurityServicePorts = {
    authentication: {
      lock: mock(async () => undefined),
      unlockWithBiometrics: mock(async () => undefined),
      unlockWithPassword: mock(async () => undefined)
    },
    biometrics: {
      summary: () => ({ enabled: false, method: '', credential: undefined, nativeAvailable: false }),
      disable: mock(),
      enableNative: mock(async () => undefined),
      enableWebAuthn: mock()
    },
    lifecycle: {
      clearPersistence: mock(),
      exit: mock(),
      quitAndInstall: mock(),
      relaunch: mock(),
      updateReady: () => false
    },
    operations: createOperationService({
      store: testStore.store,
      clock: { now: () => now++ }
    }),
    store: testStore.store,
    vault: { exists: () => true, getKey: () => 'a'.repeat(64), isUnlocked: () => true },
    ...overrides
  }
  const service = createSecurityService(ports)
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  return { operation, ports, service, ...testStore }
}

function external() {
  return {
    app: { exit: mock(), relaunch: mock() },
    biometrics: {
      summary: () => ({ enabled: false, method: '' as const, nativeAvailable: false }),
      disable: mock(),
      enableNative: mock(async () => undefined),
      enableWebAuthn: mock()
    },
    persistence: { clear: mock() },
    signers: {
      lockApp: mock((done: (error: Error | null, value?: boolean) => void) => done(null, true)),
      unlockApp: mock((_password: string, done: (error: Error | null, value?: boolean) => void) =>
        done(null, true)
      ),
      unlockAppWithBiometrics: mock(
        (
          _payload: { method: 'native' } | { method: 'webauthn'; secret: string },
          done: (error: Error | null, value?: boolean) => void
        ) => done(null, true)
      )
    },
    updater: { quitAndInstall: mock(), updateReady: false },
    vault: { exists: () => false, getKey: () => null, isUnlocked: () => false }
  }
}

describe('security lifecycle service', () => {
  it('owns the complete security lifecycle and callback translation without leaking secrets', async () => {
    const biometrics = {
      enabled: true,
      method: 'native' as const,
      nativeAvailable: true,
      credential: undefined
    }
    const { service: statusService } = harness({
      biometrics: {
        summary: () => biometrics,
        disable: mock(),
        enableNative: mock(async () => undefined),
        enableWebAuthn: mock()
      }
    })

    expect(statusService.status()).toEqual({
      locked: true,
      vaultExists: true,
      biometricUnlockEnabled: true,
      biometricAvailable: true,
      biometrics
    })
    const enableWebAuthn = mock()
    const disable = mock()
    const {
      getState: configureState,
      operation: configureOperation,
      service: configureService
    } = harness({
      biometrics: {
        summary: () => ({ enabled: false, method: '', nativeAvailable: false }),
        disable,
        enableNative: mock(async () => undefined),
        enableWebAuthn
      }
    })
    const enrollment = {
      credential: { version: 1 as const, credentialId: 'ab12', salt: 'a'.repeat(64) },
      secret: 'c'.repeat(32)
    }

    expect(
      configureService.configure(
        {
          type: 'security.configure',
          operationId: 'configure-webauthn',
          mode: 'best-available',
          browser: { status: 'enrolled', ...enrollment }
        },
        owner
      )
    ).toBeTrue()
    expect(configureOperation('configure-webauthn')).toMatchObject({
      status: 'pending',
      phase: 'configuring'
    })
    await flush()

    expect(enableWebAuthn.mock.calls).toEqual([['a'.repeat(64), enrollment.credential, enrollment.secret]])
    expect(configureState().main.biometricUnlock).toBeTrue()
    expect(JSON.stringify(configureOperation('configure-webauthn'))).not.toContain(enrollment.secret)
    expect(JSON.stringify(configureOperation('configure-webauthn'))).not.toContain(
      enrollment.credential.credentialId
    )

    configureService.configure(
      { type: 'security.configure', operationId: 'disable', mode: 'disabled' },
      owner
    )
    await flush()
    expect(disable.mock.calls).toHaveLength(1)
    expect(configureState().main.biometricUnlock).toBeFalse()
    expect(configureOperation('disable')).toMatchObject({ status: 'succeeded', phase: 'completed' })
    const enableNative = mock(async (_key: string) => undefined)
    const available = harness({
      biometrics: {
        summary: () => ({ enabled: false, method: '', nativeAvailable: true }),
        disable: mock(),
        enableNative,
        enableWebAuthn: mock()
      }
    })
    available.service.configure(
      {
        type: 'security.configure',
        operationId: 'native-fallback',
        mode: 'best-available',
        browser: { status: 'failed' }
      },
      owner
    )
    await flush()
    expect(enableNative.mock.calls).toEqual([['a'.repeat(64)]])
    expect(available.operation('native-fallback')?.status).toBe('succeeded')

    const webAuthnAdapterFailure = harness({
      biometrics: {
        summary: () => ({ enabled: false, method: '', nativeAvailable: true }),
        disable: mock(),
        enableNative,
        enableWebAuthn: mock(() => {
          throw new Error('sensitive WebAuthn persistence internals')
        })
      }
    })
    webAuthnAdapterFailure.service.configure(
      {
        type: 'security.configure',
        operationId: 'webauthn-adapter-fallback',
        mode: 'best-available',
        browser: {
          status: 'enrolled',
          credential: { version: 1, credentialId: 'ab12', salt: 'a'.repeat(64) },
          secret: 'c'.repeat(32)
        }
      },
      owner
    )
    await flush()
    expect(enableNative.mock.calls).toHaveLength(2)
    expect(webAuthnAdapterFailure.operation('webauthn-adapter-fallback')?.status).toBe('succeeded')

    const unavailable = harness()
    unavailable.service.configure(
      {
        type: 'security.configure',
        operationId: 'unavailable',
        mode: 'best-available',
        browser: { status: 'unavailable' }
      },
      owner
    )
    unavailable.service.configure(
      {
        type: 'security.configure',
        operationId: 'browser-failed',
        mode: 'best-available',
        browser: { status: 'failed' }
      },
      owner
    )
    await flush()
    expect(unavailable.operation('unavailable')).toMatchObject({
      status: 'failed',
      error: { code: 'biometrics_unavailable', message: 'Biometrics are not available on this device' }
    })
    expect(unavailable.operation('browser-failed')).toMatchObject({
      status: 'failed',
      error: { code: 'biometric_configuration_failed', message: 'Could not enable biometrics.' }
    })

    const noFallback = harness({
      biometrics: {
        summary: () => ({ enabled: false, method: '', nativeAvailable: false }),
        disable: mock(),
        enableNative: mock(async () => undefined),
        enableWebAuthn: mock(() => {
          throw new Error('sensitive WebAuthn persistence internals')
        })
      }
    })
    noFallback.service.configure(
      {
        type: 'security.configure',
        operationId: 'webauthn-no-fallback',
        mode: 'best-available',
        browser: {
          status: 'enrolled',
          credential: { version: 1, credentialId: 'ef34', salt: 'd'.repeat(64) },
          secret: 'e'.repeat(32)
        }
      },
      owner
    )
    await flush()
    expect(noFallback.operation('webauthn-no-fallback')).toMatchObject({
      status: 'failed',
      error: { code: 'biometric_configuration_failed', message: 'Could not enable biometrics.' }
    })
    expect(JSON.stringify(noFallback.operation('webauthn-no-fallback'))).not.toContain(
      'persistence internals'
    )
    const unlockWithPassword = mock(async (_password: string) => undefined)
    const unlockWithBiometrics = mock(
      async (_payload: { method: 'native' } | { method: 'webauthn'; secret: string }) => undefined
    )
    const { operation: unlockOperation, service: unlockService } = harness({
      authentication: {
        lock: mock(async () => undefined),
        unlockWithBiometrics,
        unlockWithPassword
      }
    })
    const password = 'not-stored-password'
    const secret = 'd'.repeat(32)
    unlockService.unlock(
      { type: 'security.unlock', operationId: 'password', method: 'password', password },
      owner
    )
    unlockService.unlock({ type: 'security.unlock', operationId: 'native', method: 'native' }, owner)
    unlockService.unlock(
      { type: 'security.unlock', operationId: 'webauthn', method: 'webauthn', secret },
      owner
    )
    await flush()

    expect(unlockWithPassword.mock.calls).toEqual([[password]])
    expect(unlockWithBiometrics.mock.calls).toEqual([
      [{ method: 'native' }],
      [{ method: 'webauthn', secret }]
    ])
    expect(['password', 'native', 'webauthn'].map((id) => unlockOperation(id)?.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded'
    ])
    expect(
      JSON.stringify({ password: unlockOperation('password'), webauthn: unlockOperation('webauthn') })
    ).not.toContain(password)
    expect(JSON.stringify(unlockOperation('webauthn'))).not.toContain(secret)
    const failingPasswordUnlock = mock(async () => {
      throw new Error('Incorrect password')
    })
    const { operation: failureOperation, service: failureService } = harness({
      authentication: {
        lock: mock(async () => undefined),
        unlockWithBiometrics: mock(async () => undefined),
        unlockWithPassword: failingPasswordUnlock
      }
    })
    const command = {
      type: 'security.unlock' as const,
      operationId: 'failed-password',
      method: 'password' as const,
      password: 'first-secret'
    }
    expect(failureService.unlock(command, owner)).toBeTrue()
    await flush()
    expect(failureOperation(command.operationId)).toMatchObject({
      status: 'failed',
      error: { code: 'incorrect_password', message: 'Authentication failed.' }
    })
    expect(failureService.unlock({ ...command, password: 'different-secret' }, owner)).toBeTrue()
    expect(failingPasswordUnlock.mock.calls).toHaveLength(1)
    expect(
      failureService.unlock(
        { ...command, method: 'password', password: 'collision' },
        { ...owner, windowInstanceId: 'other-window' }
      )
    ).toBeFalse()
    const lock = mock(async () => undefined)
    const savedClearPersistence = mock()
    const saved = harness({
      authentication: {
        lock,
        unlockWithBiometrics: mock(async () => undefined),
        unlockWithPassword: mock(async () => undefined)
      },
      lifecycle: {
        clearPersistence: savedClearPersistence,
        exit: mock(),
        quitAndInstall: mock(),
        relaunch: mock(),
        updateReady: () => false
      }
    })
    saved.service.lock({ type: 'wallet.lock', operationId: 'lock' }, owner)
    saved.service.reset({ type: 'wallet.reset', operationId: 'saved-reset', scope: 'saved-data' }, owner)
    await flush()
    expect(lock.mock.calls).toHaveLength(1)
    expect(saved.operation('lock')?.status).toBe('succeeded')
    expect(saved.getState().main.assetRates).toEqual({})
    expect(saved.operation('saved-reset')).toMatchObject({ status: 'succeeded', phase: 'completed' })
    expect(savedClearPersistence.mock.calls).toEqual([])

    const relaunchClearPersistence = mock()
    const relaunchApp = mock()
    const relaunchExit = mock((_code: number) => undefined)
    const relaunch = harness({
      lifecycle: {
        clearPersistence: relaunchClearPersistence,
        exit: relaunchExit,
        quitAndInstall: mock(),
        relaunch: relaunchApp,
        updateReady: () => false
      }
    })
    relaunch.service.reset(
      { type: 'wallet.reset', operationId: 'full-reset', scope: 'all-settings-data' },
      owner
    )
    await flush()
    expect(relaunchClearPersistence.mock.calls).toHaveLength(1)
    expect(relaunchApp.mock.calls).toHaveLength(1)
    expect(relaunchExit.mock.calls).toEqual([[0]])
    expect(relaunch.operation('full-reset')).toMatchObject({ status: 'pending', phase: 'resetting' })

    const quitAndInstall = mock()
    const updaterRelaunch = mock()
    const updaterExit = mock((_code: number) => undefined)
    const updater = harness({
      lifecycle: {
        clearPersistence: mock(),
        exit: updaterExit,
        quitAndInstall,
        relaunch: updaterRelaunch,
        updateReady: () => true
      }
    })
    updater.service.reset(
      { type: 'wallet.reset', operationId: 'update-reset', scope: 'all-settings-data' },
      owner
    )
    await flush()
    expect(quitAndInstall.mock.calls).toHaveLength(1)
    expect(updaterRelaunch.mock.calls).toEqual([])
    expect(updaterExit.mock.calls).toEqual([])

    const source = external()
    const adapters = createProductionSecurityAdapters(source)
    await adapters.authentication.unlockWithPassword('local-only')
    await adapters.authentication.unlockWithBiometrics({ method: 'native' })
    await adapters.authentication.lock()
    expect(source.signers.unlockApp.mock.calls[0]).toEqual(['local-only', expect.any(Function)])
    expect(source.signers.unlockAppWithBiometrics.mock.calls[0]).toEqual([
      { method: 'native' },
      expect.any(Function)
    ])
    expect(source.signers.lockApp.mock.calls[0]).toEqual([expect.any(Function)])

    const failingSource = external()
    failingSource.signers.unlockApp.mockImplementationOnce((_password, done) => done(new Error('failure')))
    failingSource.signers.unlockAppWithBiometrics.mockImplementationOnce((_payload, done) => done(null))
    const failingAdapters = createProductionSecurityAdapters(failingSource)
    await expect(failingAdapters.authentication.unlockWithPassword('local-only')).rejects.toThrow('failure')
    await expect(failingAdapters.authentication.unlockWithBiometrics({ method: 'native' })).rejects.toThrow(
      'Operation returned no result'
    )
    adapters.dispose()
    failingAdapters.dispose()
  })

  it('settles signer callbacks once and rejects pending authentication during disposal', async () => {
    const source = external()
    let complete: (error: Error | null, value?: boolean) => void = () => undefined
    source.signers.unlockApp.mockImplementation((_password, done) => {
      complete = done
    })
    const adapters = createProductionSecurityAdapters(source)

    const completed = adapters.authentication.unlockWithPassword('local-only')
    complete(null, true)
    complete(new Error('late callback'))
    await expect(completed).resolves.toBeUndefined()

    const pending = adapters.authentication.unlockWithPassword('local-only')
    adapters.dispose()
    await expect(pending).rejects.toThrow('disposed before the operation completed')
  })
})
