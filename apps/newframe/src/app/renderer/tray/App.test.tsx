import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../platform/state-sync/contract/protocol'
import type { OperationRecord } from '../../../platform/operations/operation'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { createRequestRendererCapabilitiesFake } from '../../../features/requests/renderer/requestCapabilities.test-support'
import type { SecurityCapability } from '../../../features/security/renderer/securityCapability'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { Panel } = await import('./App')
const { TrayNotificationProvider } = await import('./notification')

const fixture = registerTestRuntimeFixture()
const unlock = mock<SecurityCapability['unlock']>(async () => ({ ok: true }))
const status = mock<SecurityCapability['status']>(async () => ({
  ok: true,
  locked: true,
  vaultExists: true,
  biometricUnlockEnabled: false,
  biometricAvailable: false,
  biometrics: { enabled: false, method: '', nativeAvailable: false }
}))
let revision = 0
let operations: Record<string, OperationRecord> = {}

function publishOperation(operation: OperationRecord) {
  operations = { ...operations, [operation.id]: operation }
  const baseRevision = revision
  revision += 1
  act(() => {
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'app-security-test',
      baseRevision,
      revision,
      changes: { operations }
    })
  })
}

const operation = (
  id: string,
  status: 'pending' | 'succeeded' | 'failed',
  error?: OperationRecord['error']
): OperationRecord => ({
  id,
  type: 'security.unlock',
  status,
  startedAt: 1,
  updatedAt: status === 'pending' ? 1 : 2,
  ...(status === 'pending' ? {} : { finishedAt: 2 }),
  ...(error ? { error } : {})
})

const props = {
  appLocked: true,
  biometricUnlock: false,
  crumb: {},
  initial: true,
  notifyRequest: () => {},
  requestCapabilities: createRequestRendererCapabilitiesFake(),
  security: { status, unlock }
}

describe('tray security operations', () => {
  const resetHarness = () => {
    revision = 0
    operations = {}
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'app-security-test',
      revision,
      state: walletState({ appLock: { locked: true, vaultExists: true }, operations: {} })
    })
    unlock.mockReset().mockResolvedValue({ ok: true })
    status.mockReset().mockResolvedValue({
      ok: true,
      locked: true,
      vaultExists: true,
      biometricUnlockEnabled: false,
      biometricAvailable: false,
      biometrics: { enabled: false, method: '', nativeAvailable: false }
    })
  }

  beforeEach(resetHarness)

  it('covers password, native, and WebAuthn operation lifecycles without leaking cancellation', async () => {
    {
      const { rerender, user } = render(
        <TrayNotificationProvider>
          <Panel {...props} />
        </TrayNotificationProvider>
      )
      await user.type(screen.getByLabelText('Newframe password'), 'secret-password')
      await user.click(screen.getByRole('button', { name: 'Unlock' }))

      const command = unlock.mock.calls.at(-1)![0]
      expect(command).toEqual({
        operationId: expect.any(String),
        method: 'password',
        password: 'secret-password'
      })
      expect(screen.getByText('Unlocking')).toBeTruthy()
      publishOperation(operation(command.operationId, 'succeeded'))
      expect(screen.getByText('Unlocking')).toBeTruthy()

      rerender(
        <TrayNotificationProvider>
          <Panel {...props} appLocked={false} />
        </TrayNotificationProvider>
      )
      await waitFor(() => expect(screen.queryByText('Newframe Locked')).toBeNull())
    }
    cleanup()
    resetHarness()

    {
      status.mockResolvedValueOnce({
        ok: true,
        locked: true,
        vaultExists: true,
        biometricUnlockEnabled: true,
        biometricAvailable: true,
        biometrics: { enabled: true, method: 'native', nativeAvailable: true }
      })
      const { rerender, user } = render(
        <Panel
          {...props}
          biometricUnlock
          biometricRuntime={{
            getSecret: async () => 'unused',
            isCanceled: () => false,
            isSupported: async () => true
          }}
        />
      )
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }))
      expect(unlock.mock.calls.at(-1)![0]).toEqual({
        operationId: expect.any(String),
        method: 'native'
      })
      const nativeCommand = unlock.mock.calls.at(-1)![0]
      publishOperation(
        operation(nativeCommand.operationId, 'failed', {
          code: 'biometric_authentication_failed',
          message: 'Biometric authentication failed'
        })
      )
      status.mockResolvedValueOnce({
        ok: true,
        locked: true,
        vaultExists: true,
        biometricUnlockEnabled: true,
        biometricAvailable: true,
        biometrics: {
          enabled: true,
          method: 'webauthn',
          nativeAvailable: false,
          credential: { version: 1, credentialId: 'ab', salt: 'c'.repeat(64) }
        }
      })
      rerender(
        <Panel
          {...props}
          biometricUnlock={false}
          biometricRuntime={{
            getSecret: async () => 'd'.repeat(32),
            isCanceled: () => false,
            isSupported: async () => true
          }}
        />
      )
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }))
      expect(unlock.mock.calls.at(-1)![0]).toEqual({
        operationId: expect.any(String),
        method: 'webauthn',
        secret: 'd'.repeat(32)
      })
    }
    cleanup()
    resetHarness()

    {
      const credential = { version: 1 as const, credentialId: 'ab', salt: 'c'.repeat(64) }
      status.mockResolvedValue({
        ok: true,
        locked: true,
        vaultExists: true,
        biometricUnlockEnabled: true,
        biometricAvailable: true,
        biometrics: { enabled: true, method: 'webauthn', nativeAvailable: false, credential }
      })
      const canceled = new Error('NotAllowedError: canceled')
      const { user } = render(
        <Panel
          {...props}
          biometricUnlock
          biometricRuntime={{
            getSecret: async () => {
              throw canceled
            },
            isCanceled: (error) => error === canceled,
            isSupported: async () => true
          }}
        />
      )
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }))
      expect(unlock.mock.calls).toEqual([])
      expect(screen.queryByText(/canceled/i)).toBeNull()

      await user.type(screen.getByLabelText('Newframe password'), 'wrong')
      await user.click(screen.getByRole('button', { name: 'Unlock' }))
      const first = unlock.mock.calls.at(-1)![0]
      publishOperation(
        operation(first.operationId, 'failed', {
          code: 'incorrect_password',
          message: 'Authentication failed.'
        })
      )
      expect(await screen.findByText('Incorrect password')).toBeTruthy()

      await user.click(screen.getByRole('button', { name: 'Unlock' }))
      const second = unlock.mock.calls.at(-1)![0]
      expect(second.operationId).not.toBe(first.operationId)
      publishOperation(operation(second.operationId, 'pending'))
      publishOperation(
        operation(first.operationId, 'failed', {
          code: 'incorrect_password',
          message: 'Authentication failed.'
        })
      )
      expect(screen.queryByText('Incorrect password')).toBeNull()
      expect(screen.getByText('Unlocking')).toBeTruthy()
    }
  })
})
