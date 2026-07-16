import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  StateMessageSchema,
  type RendererState,
  type StateSnapshot,
  type StateUpdateBatch
} from '../../resources/state/protocol'
import {
  projectionStateChangeSchemas,
  projectionStateSchemas,
  type SideTrayRendererState,
  type WalletRendererState,
  type RendererProjection
} from '../../resources/state/projections'

export type { RendererState } from '../../resources/state/protocol'

type RendererStateReadApi<TState> = Pick<StoreApi<TState>, 'getInitialState' | 'getState' | 'subscribe'>

interface ActiveStream {
  streamId: string
  revision: number
}

export type StateMessageResult =
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

const rendererStateStore = createStore<RendererState>()(() => ({}))

const rendererStateStoreReadApi: RendererStateReadApi<RendererState> = {
  getInitialState: rendererStateStore.getInitialState,
  getState: rendererStateStore.getState,
  subscribe: rendererStateStore.subscribe
}

export const walletRendererStateStoreReadApi =
  rendererStateStoreReadApi as unknown as RendererStateReadApi<WalletRendererState>
export const sideTrayRendererStateStoreReadApi =
  rendererStateStoreReadApi as unknown as RendererStateReadApi<SideTrayRendererState>

let activeStream: ActiveStream | null = null
let awaitingSnapshot = true
let expectedProjection: RendererProjection | null = null

function reconnectNeeded(
  reason: Extract<StateMessageResult, { status: 'reconnect-needed' }>['reason']
): StateMessageResult {
  awaitingSnapshot = true

  return { status: 'reconnect-needed', reason }
}

function applySnapshot(message: StateSnapshot): StateMessageResult {
  if (!expectedProjection) return reconnectNeeded('invalid_message')
  const projection = projectionStateSchemas[expectedProjection].safeParse(message.state)
  if (!projection.success) {
    return reconnectNeeded('invalid_message')
  }
  if (!awaitingSnapshot) return { status: 'ignored', reason: 'unexpected_snapshot' }
  if (message.streamId === activeStream?.streamId) {
    return { status: 'ignored', reason: 'stale_stream' }
  }

  rendererStateStore.setState(projection.data, true)
  activeStream = { streamId: message.streamId, revision: message.revision }
  awaitingSnapshot = false

  return { status: 'applied', messageType: 'snapshot', revision: message.revision }
}

function applyUpdate(message: StateUpdateBatch): StateMessageResult {
  if (!expectedProjection) return reconnectNeeded('invalid_message')
  const changes = projectionStateChangeSchemas[expectedProjection].safeParse(message.changes)
  if (!changes.success) {
    return reconnectNeeded('invalid_message')
  }
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

  rendererStateStore.setState(changes.data)
  activeStream = { streamId: message.streamId, revision: message.revision }

  return { status: 'applied', messageType: 'update', revision: message.revision }
}

export function beginStateConnection(projection: RendererProjection) {
  expectedProjection = projection
  awaitingSnapshot = true
}

export function applyStateMessage(message: unknown): StateMessageResult {
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
}

export function getStateMirrorForTests() {
  return rendererStateStore.getState()
}

export function resetStateMirrorForTests(state: RendererState = {}) {
  activeStream = null
  awaitingSnapshot = true
  expectedProjection = null
  rendererStateStore.setState(state, true)
}
