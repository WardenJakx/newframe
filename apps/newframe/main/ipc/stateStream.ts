import { randomUUID } from 'crypto'

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import log from 'electron-log'

import store from '../store'
import { projectRendererState } from '../state/projections'
import { authorizeRenderer, type RendererRole } from './authorization'
import { projectionStateChangeSchemas, projectionStateSchemas } from '../../resources/state/projections'
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
} from '../../resources/state/protocol'

type Connection = {
  role: RendererRole
  streamId: string
  revision: number
  projection: RendererState
  webContents: WebContents
}

const connections = new Map<number, Connection>()

function rawProjection(role: RendererRole): RendererState {
  return projectRendererState(store.getState(), role)
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

function send(connection: Connection, message: StateMessage) {
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

export function connectState(event: IpcMainInvokeEvent) {
  const context = authorizeRenderer(event)
  if (!context) {
    log.warn('Rejected state connection from an unregistered or invalid renderer')
    return { ok: false, error: 'unauthorized' } as const
  }

  const projection = rawProjection(context.clientType)
  const snapshotState = validatedSnapshot(context.clientType, projection)
  if (!snapshotState) return { ok: false, error: 'state_unavailable' } as const

  const connection: Connection = {
    role: context.clientType,
    streamId: randomUUID(),
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

export function disconnectState(event: IpcMainInvokeEvent) {
  const context = authorizeRenderer(event)
  if (!context) return { ok: false, error: 'unauthorized' } as const

  connections.delete(context.webContentsId)
  return { ok: true } as const
}

function publishState() {
  const projections = new Map<RendererRole, RendererState | undefined>()

  for (const connection of connections.values()) {
    if (!projections.has(connection.role)) {
      projections.set(connection.role, rawProjection(connection.role))
    }

    const projection = projections.get(connection.role)
    if (!projection) continue

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

let registered = false

export function registerStateStreamHandlers() {
  if (registered) return
  registered = true

  ipcMain.handle(StateConnectChannel, connectState)
  ipcMain.handle(StateDisconnectChannel, disconnectState)
  store.subscribe(publishState)
}

export function resetStateStreamsForTests() {
  connections.clear()
}
