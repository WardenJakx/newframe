import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'

import type { WalletRendererState } from '../contract/projections'
import { STATE_STREAM_SCHEMA_VERSION, type StateSnapshot, type StateUpdateBatch } from '../contract/protocol'
import { walletChanges, walletState } from './fixtures.test-support.ts'

const fixture = registerTestRuntimeFixture()

const snapshot = (
  state: Partial<WalletRendererState>,
  { revision = 0, streamId = 'stream-one' }: { revision?: number; streamId?: string } = {}
): StateSnapshot<WalletRendererState> => ({
  schemaVersion: STATE_STREAM_SCHEMA_VERSION,
  streamId,
  revision,
  state: walletState(state)
})

const update = (
  changes: Partial<WalletRendererState>,
  {
    baseRevision = 0,
    revision = baseRevision + 1,
    streamId = 'stream-one'
  }: { baseRevision?: number; revision?: number; streamId?: string } = {}
): StateUpdateBatch<WalletRendererState> => ({
  schemaVersion: STATE_STREAM_SCHEMA_VERSION,
  streamId,
  baseRevision,
  revision,
  changes: walletChanges(changes)
})

describe('rendererStore', () => {
  beforeEach(() => {
    fixture.state.reset({})
    fixture.state.beginStateConnection('wallet-ui')
  })

  it('installs the initial stream snapshot as a full state replacement', () => {
    fixture.state.reset({ legacy: true })
    fixture.state.beginStateConnection('wallet-ui')

    expect(fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))).toEqual({
      status: 'applied',
      messageType: 'snapshot',
      revision: 0
    })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'one' })
    expect(fixture.state.getState()).not.toHaveProperty('legacy')
  })

  it('shallow-merges all changed slices atomically and preserves unchanged references', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'old' }))
    const initialSelected = fixture.state.getState().selected
    const listener = mock()
    const unsubscribe = fixture.state.wallet.subscribe(listener)
    const assetRates = { token: { usdRate: 1, source: 'zerion' as const, observedAt: 1 } }

    expect(fixture.state.applyStateMessage(update({ currentAccount: 'new', assetRates }))).toEqual({
      status: 'applied',
      messageType: 'update',
      revision: 1
    })

    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'new', assetRates })
    expect(fixture.state.getState().selected).toBe(initialSelected)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('mirrors profile and operation slices atomically and rejects unsafe operation data', () => {
    {
      fixture.state.applyStateMessage(snapshot({ currentProfile: 'default-profile' }))
      const profiles: WalletRendererState['profiles'] = [
        {
          id: 'default-profile',
          name: 'Profile 1',
          accountCount: 1,
          cachedValue: { state: 'priced', value: 12.34 }
        },
        { id: 'work', name: 'Work', accountCount: 0, cachedValue: { state: 'missing' } }
      ]

      expect(fixture.state.applyStateMessage(update({ currentProfile: 'work', profiles }))).toEqual({
        status: 'applied',
        messageType: 'update',
        revision: 1
      })
      expect(fixture.state.getState()).toMatchObject({ currentProfile: 'work', profiles })
    }

    {
      fixture.state.reset({})
      fixture.state.beginStateConnection('wallet-ui')
      fixture.state.applyStateMessage(snapshot({}))
      const operations: WalletRendererState['operations'] = {
        operation: {
          id: 'operation',
          type: 'transaction.submit',
          status: 'pending',
          startedAt: 1,
          updatedAt: 1
        }
      }

      expect(fixture.state.applyStateMessage(update({ operations }))).toEqual({
        status: 'applied',
        messageType: 'update',
        revision: 1
      })
      expect(fixture.state.getState().operations).toEqual(operations)
      const appliedOperations = fixture.state.getState().operations
      fixture.state.applyStateMessage(update({ currentAccount: 'next' }, { baseRevision: 1 }))
      expect(fixture.state.getState().operations).toBe(appliedOperations)
    }

    {
      fixture.state.reset({})
      fixture.state.beginStateConnection('wallet-ui')
      fixture.state.applyStateMessage(snapshot({}))

      expect(
        fixture.state.applyStateMessage(
          update({
            operations: {
              leaked: {
                id: 'leaked',
                type: 'transaction.submit',
                status: 'pending',
                startedAt: 1,
                updatedAt: 1,
                password: 'must-not-cross'
              }
            } as unknown as WalletRendererState['operations']
          })
        )
      ).toEqual({ status: 'reconnect-needed', reason: 'invalid_message' })
      expect(fixture.state.getState().operations).toEqual({})
    }
  })

  it('requires a snapshot before accepting updates', () => {
    expect(fixture.state.applyStateMessage(update({ currentAccount: 'two' }))).toEqual({
      status: 'reconnect-needed',
      reason: 'snapshot_required'
    })
    expect(fixture.state.getState()).toEqual({})
  })

  it('requests reconnection for invalid messages without changing state', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      fixture.state.applyStateMessage({
        ...snapshot({ currentAccount: 'two' }, { streamId: 'stream-two' }),
        schemaVersion: STATE_STREAM_SCHEMA_VERSION + 1
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'invalid_message' })

    expect(
      fixture.state.applyStateMessage({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'stream-one',
        baseRevision: 0,
        revision: 1,
        changes: { currentAccount: 42 }
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'invalid_message' })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'one' })
  })

  it('requests reconnection on a forward revision gap and accepts a replacement stream', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }, { revision: 4 }))

    expect(
      fixture.state.applyStateMessage(update({ currentAccount: 'missed' }, { baseRevision: 6, revision: 7 }))
    ).toEqual({ status: 'reconnect-needed', reason: 'revision_gap' })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'one' })

    expect(
      fixture.state.applyStateMessage(
        snapshot({ currentAccount: 'recovered' }, { revision: 0, streamId: 'stream-two' })
      )
    ).toEqual({ status: 'applied', messageType: 'snapshot', revision: 0 })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'recovered' })
  })

  it('requests reconnection when Electron invalidates the active stream', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      fixture.state.applyStateMessage({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'stream-one',
        type: 'stream-invalidated'
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'stream_invalidated' })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'one' })
  })

  it('ignores late messages from a previous stream', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))
    fixture.state.beginStateConnection('wallet-ui')
    fixture.state.applyStateMessage(
      snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' })
    )

    expect(
      fixture.state.applyStateMessage(update({ currentAccount: 'stale' }, { streamId: 'stream-one' }))
    ).toEqual({
      status: 'ignored',
      reason: 'stale_stream'
    })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'two' })
  })

  it('ignores duplicate revisions from the active stream', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))
    fixture.state.applyStateMessage(update({ currentAccount: 'two' }))

    expect(fixture.state.applyStateMessage(update({ currentAccount: 'duplicate' }))).toEqual({
      status: 'ignored',
      reason: 'stale_revision'
    })
    expect(fixture.state.getState()).toMatchObject({ currentAccount: 'two' })
  })

  it('only accepts a new snapshot after connection setup', () => {
    fixture.state.applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      fixture.state.applyStateMessage(
        snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' })
      )
    ).toEqual({ status: 'ignored', reason: 'unexpected_snapshot' })

    fixture.state.beginStateConnection('wallet-ui')
    expect(
      fixture.state.applyStateMessage(
        snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' })
      )
    ).toEqual({ status: 'applied', messageType: 'snapshot', revision: 0 })
  })
})
