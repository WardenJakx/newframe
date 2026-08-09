import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../platform/state-sync/contract/protocol'
import type { OperationRecord } from '../../../platform/operations/operation'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { createSecurityCapability } from '../../security/renderer/securityCapability'
import { createSettingsCapability } from './settingsCapability'
import type { SettingsSecurityCapability } from './Settings'
import type { AppCommand, AppQuery } from '../../../app/contracts/operations'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { Settings } = await import('./Settings')

const fixture = registerTestRuntimeFixture()
const settingsCapability = createSettingsCapability({
  executeCommand: (command) => fixture.client.executeCommand(command)
})
type CommandCall = [command: AppCommand]
type QueryCall = [query: AppQuery]
const commandCalls = () => fixture.client.executeCommand.mock.calls as CommandCall[]
const queryCalls = () => fixture.client.executeQuery.mock.calls as QueryCall[]
const lastCommand = () => {
  const command = commandCalls().at(-1)?.[0]
  if (!command) throw new Error('Expected a settings command')
  return command
}
let revision = 0
let operations: Record<string, OperationRecord> = {}
const onPostLockNavigation = mock()

function publish(changes: Record<string, unknown>) {
  const baseRevision = revision
  revision += 1
  act(() => {
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'settings-security-test',
      baseRevision,
      revision,
      changes
    })
  })
}

function publishOperation(operation: OperationRecord, changes: Record<string, unknown> = {}) {
  operations = { ...operations, [operation.id]: operation }
  publish({ ...changes, operations })
}

const operation = (
  id: string,
  type: OperationRecord['type'],
  status: 'pending' | 'succeeded' | 'failed',
  error?: OperationRecord['error']
): OperationRecord => ({
  id,
  type,
  status,
  startedAt: 1,
  updatedAt: status === 'pending' ? 1 : 2,
  ...(status === 'pending' ? {} : { finishedAt: 2 }),
  ...(error ? { error } : {})
})

type BiometricRuntime = Pick<
  SettingsSecurityCapability,
  'createWebAuthnCredential' | 'isBiometricUserCanceled' | 'isWebAuthnSupported'
>

function renderSettings(runtime: BiometricRuntime) {
  const security = { ...createSecurityCapability(fixture.client), ...runtime }
  return render(
    <Settings
      capability={settingsCapability}
      onBack={mock()}
      onPostLockNavigation={onPostLockNavigation}
      onSelectedChainChange={mock()}
      selectedChainId={0}
      security={security}
    />
  )
}

describe('settings security operations', () => {
  const resetHarness = () => {
    revision = 0
    operations = {}
    onPostLockNavigation.mockClear()
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'settings-security-test',
      revision,
      state: walletState({
        appLock: { locked: false, vaultExists: true },
        biometricUnlock: false,
        operations: {}
      })
    })
    fixture.client.executeCommand.mockReset().mockResolvedValue({ ok: true })
    fixture.client.executeQuery.mockReset()
  }

  beforeEach(resetHarness)

  it('covers configure, fallback, cancellation, failure, lock, and reset operation projections', async () => {
    {
      const enrollment = {
        credential: { version: 1 as const, credentialId: 'ab12', salt: 'a'.repeat(64) },
        secret: 'b'.repeat(32)
      }
      const { user } = renderSettings({
        createWebAuthnCredential: async () => enrollment,
        isBiometricUserCanceled: () => false,
        isWebAuthnSupported: async () => true
      })

      await user.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      const command = lastCommand()
      if (command.type !== 'security.configure') throw new Error('Expected security configure command')
      expect(command).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'enrolled', ...enrollment }
      })
      expect(commandCalls()).toHaveLength(1)
      expect(queryCalls()).toEqual([])
      expect(screen.getByText('Waiting for authentication')).toBeTruthy()

      publishOperation(operation(command.operationId, command.type, 'succeeded'))
      expect(screen.getByText('Waiting for authentication')).toBeTruthy()
      publish({ biometricUnlock: true, operations })
      await waitFor(() => expect(screen.queryByText('Waiting for authentication')).toBeNull())
    }
    cleanup()
    resetHarness()

    {
      const { user: unsupportedUser, unmount: unmountUnsupported } = renderSettings({
        createWebAuthnCredential: async () => {
          throw new Error('unused')
        },
        isBiometricUserCanceled: () => false,
        isWebAuthnSupported: async () => false
      })
      await unsupportedUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect(lastCommand()).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'unavailable' }
      })
      unmountUnsupported()
      fixture.client.executeCommand.mockClear()
      const { user: failureUser, unmount: unmountFailure } = renderSettings({
        createWebAuthnCredential: async () => {
          throw new Error('browser internals must stay local')
        },
        isBiometricUserCanceled: () => false,
        isWebAuthnSupported: async () => true
      })
      await failureUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect(lastCommand()).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'failed' }
      })
      expect(JSON.stringify(commandCalls())).not.toContain('browser internals')
      unmountFailure()
      fixture.client.executeCommand.mockClear()
      const canceled = new Error('canceled')
      const { user: cancellationUser } = renderSettings({
        createWebAuthnCredential: async () => {
          throw canceled
        },
        isBiometricUserCanceled: (error) => error === canceled,
        isWebAuthnSupported: async () => true
      })
      await cancellationUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect(commandCalls()).toEqual([])
      expect(screen.queryByText(/canceled/i)).toBeNull()
    }
    cleanup()
    resetHarness()

    {
      const { user } = renderSettings({
        createWebAuthnCredential: async () => {
          throw new Error('unused')
        },
        isBiometricUserCanceled: () => false,
        isWebAuthnSupported: async () => false
      })
      await user.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      const configure = lastCommand()
      if (configure.type !== 'security.configure') throw new Error('Expected security configure command')
      publishOperation(
        operation(configure.operationId, configure.type, 'failed', {
          code: 'biometrics_unavailable',
          message: 'Biometrics are not available on this device'
        })
      )
      expect(await screen.findByText('Biometrics are not available on this device')).toBeTruthy()

      await user.click(screen.getByRole('button', { name: 'Lock Newframe' }))
      const lock = lastCommand()
      if (lock.type !== 'wallet.lock') throw new Error('Expected wallet lock command')
      expect(lock).toEqual({ type: 'wallet.lock', operationId: expect.any(String) })
      publishOperation(operation(lock.operationId, lock.type, 'succeeded'))
      expect(onPostLockNavigation).not.toHaveBeenCalled()
      publish({ appLock: { locked: true, vaultExists: true }, operations })
      await waitFor(() => expect(onPostLockNavigation).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole('button', { name: 'Reset Saved Data' }))
      expect(lastCommand()).toEqual({
        type: 'wallet.reset',
        operationId: expect.any(String),
        scope: 'saved-data'
      })
      const savedReset = lastCommand()
      if (savedReset.type !== 'wallet.reset') throw new Error('Expected wallet reset command')
      publishOperation(operation(savedReset.operationId, savedReset.type, 'succeeded'))

      await user.click(screen.getByRole('button', { name: 'Reset All Settings & Data' }))
      await user.click(screen.getByRole('button', { name: 'Yes' }))
      expect(lastCommand()).toEqual({
        type: 'wallet.reset',
        operationId: expect.any(String),
        scope: 'all-settings-data'
      })
    }
  })
})
