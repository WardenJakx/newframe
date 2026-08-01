import { beforeEach, describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../../contracts/state/protocol'
import type { OperationRecord } from '../../../../../domain/state/operation'
import { walletState } from '../../../../state/fixtures.test-support'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../state/rendererStore'
import { HomeUiProvider, useHomeUiStore } from '../../state/HomeUiProvider'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { Settings } = await import('./Settings')

const link = createHostFixture()
let revision = 0
let operations: Record<string, OperationRecord> = {}

function publish(changes: Record<string, unknown>) {
  const baseRevision = revision
  revision += 1
  act(() => {
    applyStateMessage({
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

function OverlayState() {
  const overlay = useHomeUiStore((state) => state.overlay)
  return <output aria-label='Overlay state'>{overlay.type}</output>
}

function renderSettings(biometricRuntime: NonNullable<Parameters<typeof Settings>[0]>['biometricRuntime']) {
  return render(
    <HomeUiProvider>
      <OverlayState />
      <Settings biometricRuntime={biometricRuntime} />
    </HomeUiProvider>
  )
}

describe('settings security operations', () => {
  const resetHarness = () => {
    revision = 0
    operations = {}
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'settings-security-test',
      revision,
      state: walletState({
        appLock: { locked: false, vaultExists: true },
        biometricUnlock: false,
        operations: {}
      })
    })
    ;(link.executeCommand as Mock<any>).mockReset().mockResolvedValue({ ok: true })
    ;(link.executeQuery as Mock<any>).mockReset()
  }

  beforeEach(resetHarness)

  it('covers configure, fallback, cancellation, failure, lock, and reset operation projections', async () => {
    {
      const enrollment = {
        credential: { version: 1 as const, credentialId: 'ab12', salt: 'a'.repeat(64) },
        secret: 'b'.repeat(32)
      }
      const { user } = renderSettings({
        createCredential: async () => enrollment,
        isCanceled: () => false,
        isSupported: async () => true
      })

      await user.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      const command = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
        operationId: string
        type: string
        [key: string]: unknown
      }
      expect(command).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'enrolled', ...enrollment }
      })
      expect((link.executeCommand as Mock<any>).mock.calls).toHaveLength(1)
      expect((link.executeQuery as Mock<any>).mock.calls).toEqual([])
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
        createCredential: async () => {
          throw new Error('unused')
        },
        isCanceled: () => false,
        isSupported: async () => false
      })
      await unsupportedUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect((link.executeCommand as Mock<any>).mock.calls.at(-1)![0]).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'unavailable' }
      })
      unmountUnsupported()
      ;(link.executeCommand as Mock<any>).mockClear()
      const { user: failureUser, unmount: unmountFailure } = renderSettings({
        createCredential: async () => {
          throw new Error('browser internals must stay local')
        },
        isCanceled: () => false,
        isSupported: async () => true
      })
      await failureUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect((link.executeCommand as Mock<any>).mock.calls.at(-1)![0]).toEqual({
        type: 'security.configure',
        operationId: expect.any(String),
        mode: 'best-available',
        browser: { status: 'failed' }
      })
      expect(JSON.stringify((link.executeCommand as Mock<any>).mock.calls)).not.toContain('browser internals')
      unmountFailure()
      ;(link.executeCommand as Mock<any>).mockClear()
      const canceled = new Error('canceled')
      const { user: cancellationUser } = renderSettings({
        createCredential: async () => {
          throw canceled
        },
        isCanceled: (error) => error === canceled,
        isSupported: async () => true
      })
      await cancellationUser.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      expect((link.executeCommand as Mock<any>).mock.calls).toEqual([])
      expect(screen.queryByText(/canceled/i)).toBeNull()
    }
    cleanup()
    resetHarness()

    {
      const { user } = renderSettings({
        createCredential: async () => {
          throw new Error('unused')
        },
        isCanceled: () => false,
        isSupported: async () => false
      })
      await user.click(screen.getByRole('switch', { name: 'Biometric Login' }))
      const configure = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
        operationId: string
        type: string
      }
      publishOperation(
        operation(configure.operationId, configure.type, 'failed', {
          code: 'biometrics_unavailable',
          message: 'Biometrics are not available on this device'
        })
      )
      expect(await screen.findByText('Biometrics are not available on this device')).toBeTruthy()

      await user.click(screen.getByRole('button', { name: 'Lock Newframe' }))
      const lock = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
        operationId: string
        type: string
      }
      expect(lock).toEqual({ type: 'wallet.lock', operationId: expect.any(String) })
      publishOperation(operation(lock.operationId, lock.type, 'succeeded'))
      expect(screen.getByLabelText('Overlay state').textContent).toBe('none')
      publish({ appLock: { locked: true, vaultExists: true }, operations })
      await waitFor(() => expect(screen.getByLabelText('Overlay state').textContent).toBe('menu'))

      await user.click(screen.getByRole('button', { name: 'Reset Saved Data' }))
      expect((link.executeCommand as Mock<any>).mock.calls.at(-1)![0]).toEqual({
        type: 'wallet.reset',
        operationId: expect.any(String),
        scope: 'saved-data'
      })
      const savedReset = (link.executeCommand as Mock<any>).mock.calls.at(-1)![0] as {
        operationId: string
        type: string
      }
      publishOperation(operation(savedReset.operationId, savedReset.type, 'succeeded'))

      await user.click(screen.getByRole('button', { name: 'Reset All Settings & Data' }))
      await user.click(screen.getByRole('button', { name: 'Yes' }))
      expect((link.executeCommand as Mock<any>).mock.calls.at(-1)![0]).toEqual({
        type: 'wallet.reset',
        operationId: expect.any(String),
        scope: 'all-settings-data'
      })
    }
  })
})
