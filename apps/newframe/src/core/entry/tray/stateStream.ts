import type { IpcMainInvokeEvent, WebContents } from 'electron'
import log from 'electron-log'

import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import {
  projectionStateChangeSchemas,
  projectionStateSchemas
} from '../../../platform/state-sync/contract/projections.ts'
import {
  StateConnectChannel,
  StateDisconnectChannel,
  StateMessageChannel,
  type TrayState,
  type StateMessage
} from '../../../platform/state-sync/contract/protocol.ts'
import type { TrayAuthorizationRegistry, TrayRole } from './authorization.ts'

export interface StateStreamDependencies {
  store: CanonicalStoreReader
  authorizeTray: TrayAuthorizationRegistry['authorizeTray']
  projectTrayState: typeof import('../../../platform/state-sync/main/projections.ts').projectTrayState
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
  role: TrayRole
  windowInstanceId: string
  projection: TrayState
  webContents: WebContents
}

function validatedSnapshot(role: TrayRole, projection: TrayState): TrayState | undefined {
  const result = projectionStateSchemas[role].safeParse(projection)

  if (!result.success) {
    log.error('Refused to publish an invalid tray state projection', {
      role,
      issues: result.error.issues
    })
    return
  }

  return result.data
}

function validatedChanges(role: TrayRole, changes: TrayState): TrayState | undefined {
  const result = projectionStateChangeSchemas[role].safeParse(changes)

  if (!result.success) {
    log.error('Refused to publish invalid tray state changes', {
      role,
      issues: result.error.issues
    })
    return
  }

  return result.data
}

function changedTopLevelSlices(previous: TrayState, current: TrayState) {
  const changes: TrayState = {}

  for (const [key, value] of Object.entries(current)) {
    if (previous[key] !== value) {
      changes[key] = value
    }
  }

  return changes
}

export function createStateStream({
  store,
  authorizeTray,
  projectTrayState
}: StateStreamDependencies): StateStream {
  const connections = new Map<number, Connection>()
  let unregisterHandlers: (() => void) | undefined

  const rawProjection = (connection: Pick<Connection, 'role' | 'windowInstanceId'>): TrayState =>
    projectTrayState(store.getState(), {
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
      log.error('Failed to publish tray state message', error)
      if (!connection.webContents.isDestroyed()) {
        connection.webContents.reload()
      }
      return false
    }
  }

  const connectState = (event: IpcMainInvokeEvent) => {
    const context = authorizeTray(event)
    if (!context) {
      log.warn('Rejected state connection from an unregistered or invalid tray')
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
    const context = authorizeTray(event)
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
