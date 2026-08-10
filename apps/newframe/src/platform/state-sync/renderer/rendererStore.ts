import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  StateMessageSchema,
  type RendererState,
  type StateSnapshot,
  type StateUpdateBatch
} from '../contract/protocol'
import {
  projectionStateChangeSchemas,
  projectionStateSchemas,
  type SideTrayRendererState,
  type WalletRendererState,
  type RendererProjection
} from '../contract/projections'

export type { RendererState } from '../contract/protocol'

type RendererStateReadApi<TState> = Pick<StoreApi<TState>, 'getInitialState' | 'getState' | 'subscribe'>

interface ActiveStream {
  streamId: string
  revision: number
}

interface RendererStateConnection {
  activeStream: Readonly<ActiveStream> | null
  awaitingSnapshot: boolean
  expectedProjection: RendererProjection | null
}

type StateMessageResult =
  | {
      status: 'applied'
      messageType: 'snapshot' | 'update'
      revision: number
    }
  | {
      status: 'ignored'
      reason: 'stale_revision' | 'stale_stream' | 'unexpected_snapshot'
    }
  | {
      status: 'reconnect-needed'
      reason: 'invalid_message' | 'revision_gap' | 'snapshot_required' | 'stream_invalidated'
    }

export interface RendererStateStore {
  wallet: RendererStateReadApi<WalletRendererState>
  sideTray: RendererStateReadApi<SideTrayRendererState>
  getState(): RendererState
  reset(state?: RendererState): void
  beginStateConnection(projection: RendererProjection): void
  applyStateMessage(message: unknown): StateMessageResult
  getConnectionState(): RendererStateConnection
}

export function createRendererStateStore(initialState: RendererState = {}): RendererStateStore {
  const store = createStore<RendererState>()(() => initialState)
  const readApi: RendererStateReadApi<RendererState> = {
    getInitialState: store.getInitialState,
    getState: store.getState,
    subscribe: store.subscribe
  }
  const wallet = readApi as unknown as RendererStateReadApi<WalletRendererState>
  const sideTray = readApi as unknown as RendererStateReadApi<SideTrayRendererState>
  let activeStream: ActiveStream | null = null
  let awaitingSnapshot = true
  let expectedProjection: RendererProjection | null = null

  const reconnectNeeded = (
    reason: Extract<StateMessageResult, { status: 'reconnect-needed' }>['reason']
  ): StateMessageResult => {
    awaitingSnapshot = true

    return { status: 'reconnect-needed', reason }
  }

  const applySnapshot = (message: StateSnapshot): StateMessageResult => {
    if (!expectedProjection) return reconnectNeeded('invalid_message')
    const projection = projectionStateSchemas[expectedProjection].safeParse(message.state)
    if (!projection.success) return reconnectNeeded('invalid_message')
    if (!awaitingSnapshot) return { status: 'ignored', reason: 'unexpected_snapshot' }
    if (message.streamId === activeStream?.streamId) {
      return { status: 'ignored', reason: 'stale_stream' }
    }

    store.setState(projection.data, true)
    activeStream = { streamId: message.streamId, revision: message.revision }
    awaitingSnapshot = false

    return { status: 'applied', messageType: 'snapshot', revision: message.revision }
  }

  const applyUpdate = (message: StateUpdateBatch): StateMessageResult => {
    if (!expectedProjection) return reconnectNeeded('invalid_message')
    const changes = projectionStateChangeSchemas[expectedProjection].safeParse(message.changes)
    if (!changes.success) return reconnectNeeded('invalid_message')
    if (!activeStream) return reconnectNeeded('snapshot_required')

    if (awaitingSnapshot) {
      if (message.streamId === activeStream.streamId) {
        return { status: 'ignored', reason: 'stale_stream' }
      }

      return reconnectNeeded('snapshot_required')
    }

    if (message.streamId !== activeStream.streamId) {
      return { status: 'ignored', reason: 'stale_stream' }
    }

    if (message.baseRevision < activeStream.revision) {
      return { status: 'ignored', reason: 'stale_revision' }
    }

    if (message.baseRevision > activeStream.revision) return reconnectNeeded('revision_gap')

    store.setState(changes.data)
    activeStream = { streamId: message.streamId, revision: message.revision }

    return { status: 'applied', messageType: 'update', revision: message.revision }
  }

  return {
    wallet,
    sideTray,
    getState: store.getState,
    reset: (state = {}) => {
      activeStream = null
      awaitingSnapshot = true
      expectedProjection = null
      store.setState(state, true)
    },
    beginStateConnection: (projection) => {
      expectedProjection = projection
      awaitingSnapshot = true
    },
    applyStateMessage: (message) => {
      const parsedMessage = StateMessageSchema.safeParse(message)

      if (!parsedMessage.success) return reconnectNeeded('invalid_message')

      if ('type' in parsedMessage.data) {
        if (activeStream && parsedMessage.data.streamId !== activeStream.streamId) {
          return { status: 'ignored', reason: 'stale_stream' }
        }
        return reconnectNeeded('stream_invalidated')
      }
      if ('state' in parsedMessage.data) return applySnapshot(parsedMessage.data)

      return applyUpdate(parsedMessage.data)
    },
    getConnectionState: () => ({
      activeStream: activeStream ? { ...activeStream } : null,
      awaitingSnapshot,
      expectedProjection
    })
  }
}
