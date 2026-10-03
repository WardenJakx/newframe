import type { IpcMainInvokeEvent, WebContents } from 'electron'
import log from 'electron-log'

import type { CanonicalStoreReader } from '../../state-store/actions.js'
import {
  projectionStateChangeSchemas,
  projectionStateSchemas
} from '../../state-sync/contract/projections.js'
import {
  StateConnectChannel,
  StateDisconnectChannel,
  StateMessageChannel,
  type RendererState,
  type StateMessage
} from '../../state-sync/contract/protocol.js'
import type { RendererAuthorizationRegistry, RendererRole } from './authorization.js'

export interface StateStreamDependencies {
  store: CanonicalStoreReader
  authorizeRenderer: RendererAuthorizationRegistry['authorizeRenderer']
  projectRendererState: typeof import('../../state-sync/main/projections.js').projectRendererState
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
    if (previous[key] !== value) {
      changes[key] = value
    }
  }

  return changes
}

export function createStateStream({
  store,
  authorizeRenderer,
  projectRendererState
}: StateStreamDependencies): StateStream {
  const connections = new Map<number, Connection>()
  let unregisterHandlers: (() => void) | undefined

  const rawProjection = (connection: Pick<Connection, 'role' | 'windowInstanceId'>): RendererState =>
    projectRendererState(store.getState(), {
      clientType: connection.role,
      windowInstanceId: connection.windowInstanceId
    })

  const send = (connection: Connection, message: StateMessage) => {
    if (connection.webContents.isDestroyed()) {
      connections.delete(connection.webContents.id)
      return false
    }

    try {
      connection.webContents.send(StateMessageChannel, message)
      return true
    } catch (error) {
      connections.delete(connection.webContents.id)
      log.error('Failed to publish renderer state message', error)
      if (!connection.webContents.isDestroyed()) {
        connection.webContents.reload()
      }
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
    if (!snapshotState) {
      return { ok: false, error: 'state_unavailable' } as const
    }

    const connection: Connection = {
      role: context.clientType,
      windowInstanceId: context.windowInstanceId,
      projection,
      webContents: event.sender
    }
    connections.set(event.sender.id, connection)
    event.sender.once('destroyed', () => {
      if (connections.get(event.sender.id) === connection) {
        connections.delete(event.sender.id)
      }
    })

    if (!send(connection, { state: snapshotState })) {
      return { ok: false, error: 'state_unavailable' } as const
    }

    return { ok: true } as const
  }

  const disconnectState = (event: IpcMainInvokeEvent) => {
    const context = authorizeRenderer(event)
    if (!context) {
      return { ok: false, error: 'unauthorized' } as const
    }

    connections.delete(context.webContentsId)
    return { ok: true } as const
  }

  const publishState = () => {
    for (const connection of connections.values()) {
      const projection = rawProjection(connection)

      const rawChanges = changedTopLevelSlices(connection.projection, projection)
      if (Object.keys(rawChanges).length === 0) {
        continue
      }
      const changes = validatedChanges(connection.role, rawChanges)
      // Invalid changes stay pending: the next publish retries them against the last sent projection.
      if (changes && send(connection, { changes })) {
        connection.projection = projection
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
      if (!registered) {
        return
      }
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
