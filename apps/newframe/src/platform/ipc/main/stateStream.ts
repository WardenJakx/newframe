import { randomUUID } from 'crypto'

import type { IpcMainInvokeEvent, WebContents } from 'electron'
import log from 'electron-log'

import type { RendererAuthorizationRegistry, RendererRole } from './authorization.js'
import type { CanonicalStoreReader } from '../../state-store/actions.js'
import {
  projectionStateChangeSchemas,
  projectionStateSchemas
} from '../../state-sync/contract/projections.js'
import {
  STATE_STREAM_SCHEMA_VERSION,
  StateConnectChannel,
  StateDisconnectChannel,
  StateMessageChannel,
  StateMessageSchema,
  type RendererState,
  type StateMessage,
  type StateSnapshot,
  type StateUpdateBatch
} from '../../state-sync/contract/protocol.js'

export interface StateStreamDependencies {
  store: CanonicalStoreReader
  authorizeRenderer: RendererAuthorizationRegistry['authorizeRenderer']
  projectRendererState: typeof import('../../state-sync/main/projections.js').projectRendererState
  createStreamId?: () => string
}

interface StateStreamIpcPort {
  handle(
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown
  ): void
  removeHandler(channel: string): void
}

export interface StateStream {
  connectState(event: IpcMainInvokeEvent): { ok: boolean; error?: string }
  disconnectState(event: IpcMainInvokeEvent): { ok: boolean; error?: string }
  publishState(): void
  registerHandlers(ipc: StateStreamIpcPort): () => void
  dispose(): void
}

type Connection = {
  role: RendererRole
  windowInstanceId: string
  streamId: string
  revision: number
  projection: RendererState
  webContents: WebContents
}

function validatedSnapshot(role: RendererRole, projection: RendererState): RendererState | undefined {
  const result = projectionStateSchemas[role].safeParse(projection)

  if (!result.success) {
    log.error('Refused to publish an invalid renderer state projection', {
      role,
      issues: result.error.issues
    })
    return
  }

  return result.data
}

function validatedChanges(role: RendererRole, changes: RendererState): RendererState | undefined {
  const result = projectionStateChangeSchemas[role].safeParse(changes)

  if (!result.success) {
    log.error('Refused to publish invalid renderer state changes', {
      role,
      issues: result.error.issues
    })
    return
  }

  return result.data
}

function changedTopLevelSlices(previous: RendererState, current: RendererState) {
  const changes: RendererState = {}

  for (const [key, value] of Object.entries(current)) {
    if (previous[key] !== value) changes[key] = value
  }

  return changes
}

export function createStateStream({
  store,
  authorizeRenderer,
  projectRendererState,
  createStreamId = randomUUID
}: StateStreamDependencies): StateStream {
  const connections = new Map<number, Connection>()
  let unregisterHandlers: (() => void) | undefined

  const rawProjection = (connection: Pick<Connection, 'role' | 'windowInstanceId'>): RendererState =>
    projectRendererState(store.getState(), {
      clientType: connection.role,
      windowInstanceId: connection.windowInstanceId
    })

  const send = (connection: Connection, message: StateMessage) => {
    const parsed = StateMessageSchema.safeParse(message)
    if (!parsed.success) {
      log.error('Refused to send an invalid renderer state message', parsed.error.issues)
      return false
    }

    if (connection.webContents.isDestroyed()) {
      connections.delete(connection.webContents.id)
      return false
    }

    try {
      connection.webContents.send(StateMessageChannel, parsed.data)
      return true
    } catch (error) {
      connections.delete(connection.webContents.id)
      log.error('Failed to publish renderer state message', error)
      if (!connection.webContents.isDestroyed()) connection.webContents.reload()
      return false
    }
  }

  const connectState = (event: IpcMainInvokeEvent) => {
    const context = authorizeRenderer(event)
    if (!context) {
      log.warn('Rejected state connection from an unregistered or invalid renderer')
      return { ok: false, error: 'unauthorized' } as const
    }

    const projection = rawProjection({
      role: context.clientType,
      windowInstanceId: context.windowInstanceId
    })
    const snapshotState = validatedSnapshot(context.clientType, projection)
    if (!snapshotState) return { ok: false, error: 'state_unavailable' } as const

    const connection: Connection = {
      role: context.clientType,
      windowInstanceId: context.windowInstanceId,
      streamId: createStreamId(),
      revision: 0,
      projection,
      webContents: event.sender
    }
    connections.set(event.sender.id, connection)
    event.sender.once('destroyed', () => {
      if (connections.get(event.sender.id) === connection) connections.delete(event.sender.id)
    })

    const snapshot: StateSnapshot = {
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: connection.streamId,
      revision: connection.revision,
      state: snapshotState
    }

    if (!send(connection, snapshot)) return { ok: false, error: 'state_unavailable' } as const

    return { ok: true } as const
  }

  const disconnectState = (event: IpcMainInvokeEvent) => {
    const context = authorizeRenderer(event)
    if (!context) return { ok: false, error: 'unauthorized' } as const

    connections.delete(context.webContentsId)
    return { ok: true } as const
  }

  const publishState = () => {
    for (const connection of connections.values()) {
      const projection = rawProjection(connection)

      const rawChanges = changedTopLevelSlices(connection.projection, projection)
      if (Object.keys(rawChanges).length === 0) continue
      const changes = validatedChanges(connection.role, rawChanges)
      if (!changes) {
        send(connection, {
          schemaVersion: STATE_STREAM_SCHEMA_VERSION,
          streamId: connection.streamId,
          type: 'stream-invalidated'
        })
        connections.delete(connection.webContents.id)
        continue
      }

      const revision = connection.revision + 1
      const update: StateUpdateBatch = {
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: connection.streamId,
        baseRevision: connection.revision,
        revision,
        changes
      }

      if (send(connection, update)) {
        connection.projection = projection
        connection.revision = revision
      }
    }
  }

  const dispose = () => {
    unregisterHandlers?.()
    unregisterHandlers = undefined
    connections.clear()
  }

  const registerHandlers = (ipc: StateStreamIpcPort) => {
    unregisterHandlers?.()

    ipc.handle(StateConnectChannel, connectState)
    ipc.handle(StateDisconnectChannel, disconnectState)
    const unsubscribe = store.subscribe(publishState)
    let registered = true

    unregisterHandlers = () => {
      if (!registered) return
      registered = false
      unsubscribe()
      ipc.removeHandler(StateConnectChannel)
      ipc.removeHandler(StateDisconnectChannel)
      connections.clear()
      unregisterHandlers = undefined
    }

    return unregisterHandlers
  }

  return { connectState, disconnectState, publishState, registerHandlers, dispose }
}
