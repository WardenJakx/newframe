import {
  applyStateMessage,
  beginStateConnection,
  getStateMirrorForTests,
  resetStateMirrorForTests,
  walletRendererStateStoreReadApi
} from '../../../../app/state/rendererStore'
import type { WalletRendererState } from '../../../../resources/state/projections'
import {
  STATE_STREAM_SCHEMA_VERSION,
  type StateSnapshot,
  type StateUpdateBatch
} from '../../../../resources/state/protocol'
import { walletChanges, walletState } from '../fixtures'

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
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
  })

  it('installs the initial stream snapshot as a full state replacement', () => {
    resetStateMirrorForTests({ legacy: true })
    beginStateConnection('wallet-ui')

    expect(applyStateMessage(snapshot({ currentAccount: 'one' }))).toEqual({
      status: 'applied',
      messageType: 'snapshot',
      revision: 0
    })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'one' })
    expect(getStateMirrorForTests()).not.toHaveProperty('legacy')
  })

  it('shallow-merges all changed slices atomically and preserves unchanged references', () => {
    applyStateMessage(snapshot({ currentAccount: 'old' }))
    const initialSelected = getStateMirrorForTests().selected
    const listener = jest.fn()
    const unsubscribe = walletRendererStateStoreReadApi.subscribe(listener)
    const rates = { token: { usd: { price: 1, change24hr: 0 } } }

    expect(applyStateMessage(update({ currentAccount: 'new', rates }))).toEqual({
      status: 'applied',
      messageType: 'update',
      revision: 1
    })

    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'new', rates })
    expect(getStateMirrorForTests().selected).toBe(initialSelected)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('requires a snapshot before accepting updates', () => {
    expect(applyStateMessage(update({ currentAccount: 'two' }))).toEqual({
      status: 'reconnect-needed',
      reason: 'snapshot_required'
    })
    expect(getStateMirrorForTests()).toEqual({})
  })

  it('requests reconnection for invalid messages without changing state', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      applyStateMessage({
        ...snapshot({ currentAccount: 'two' }, { streamId: 'stream-two' }),
        schemaVersion: STATE_STREAM_SCHEMA_VERSION + 1
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'invalid_message' })

    expect(
      applyStateMessage({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'stream-one',
        baseRevision: 0,
        revision: 1,
        changes: { currentAccount: 42 }
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'invalid_message' })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'one' })
  })

  it('requests reconnection on a forward revision gap and accepts a replacement stream', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }, { revision: 4 }))

    expect(applyStateMessage(update({ currentAccount: 'missed' }, { baseRevision: 6, revision: 7 }))).toEqual(
      { status: 'reconnect-needed', reason: 'revision_gap' }
    )
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'one' })

    expect(
      applyStateMessage(snapshot({ currentAccount: 'recovered' }, { revision: 0, streamId: 'stream-two' }))
    ).toEqual({ status: 'applied', messageType: 'snapshot', revision: 0 })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'recovered' })
  })

  it('requests reconnection when Electron invalidates the active stream', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      applyStateMessage({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'stream-one',
        type: 'stream-invalidated'
      })
    ).toEqual({ status: 'reconnect-needed', reason: 'stream_invalidated' })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'one' })
  })

  it('ignores late messages from a previous stream', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }))
    beginStateConnection('wallet-ui')
    applyStateMessage(snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' }))

    expect(applyStateMessage(update({ currentAccount: 'stale' }, { streamId: 'stream-one' }))).toEqual({
      status: 'ignored',
      reason: 'stale_stream'
    })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'two' })
  })

  it('ignores duplicate revisions from the active stream', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }))
    applyStateMessage(update({ currentAccount: 'two' }))

    expect(applyStateMessage(update({ currentAccount: 'duplicate' }))).toEqual({
      status: 'ignored',
      reason: 'stale_revision'
    })
    expect(getStateMirrorForTests()).toMatchObject({ currentAccount: 'two' })
  })

  it('only accepts a new snapshot after connection setup', () => {
    applyStateMessage(snapshot({ currentAccount: 'one' }))

    expect(
      applyStateMessage(snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' }))
    ).toEqual({ status: 'ignored', reason: 'unexpected_snapshot' })

    beginStateConnection('wallet-ui')
    expect(
      applyStateMessage(snapshot({ currentAccount: 'two' }, { revision: 0, streamId: 'stream-two' }))
    ).toEqual({ status: 'applied', messageType: 'snapshot', revision: 0 })
  })
})
