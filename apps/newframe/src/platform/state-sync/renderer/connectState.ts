import type { RendererProjection } from '../contract/projections'
import type { StateConnectionResult, StateMessage } from '../contract/protocol'
import type { RendererStateStore } from './rendererStore'

const reconnectDelay = 250

export interface RendererStateConnectionClient {
  connectState(handler: (message: StateMessage) => void): Promise<StateConnectionResult>
  disconnectState(): Promise<StateConnectionResult>
}

export async function connectRendererState(
  projection: RendererProjection,
  state: RendererStateStore,
  client: RendererStateConnectionClient
) {
  const controller = new AbortController()
  const isStopped = () => controller.signal.aborted
  let reconnecting = false
  const retry = { requested: false }
  const isRetryRequested = () => retry.requested
  let resolveInitialSnapshot!: () => void
  const initialSnapshot = new Promise<void>((resolve) => {
    resolveInitialSnapshot = resolve
  })

  const establishConnection = async () => {
    state.beginStateConnection(projection)
    const result = await client.connectState(handleMessage)
    if (!result.ok) {
      throw new Error(`State connection failed: ${result.error}`)
    }
  }

  const reconnect = async () => {
    retry.requested = true
    if (reconnecting || isStopped()) {
      return
    }
    reconnecting = true

    while (!isStopped()) {
      retry.requested = false
      try {
        await client.disconnectState()
        if (isStopped()) {
          break
        }
        await establishConnection()
        if (isStopped()) {
          await client.disconnectState()
          break
        }
        if (!isRetryRequested()) {
          break
        }
      } catch (error) {
        console.error('Could not reconnect renderer state', error)
        retry.requested = true
      }

      if (isRetryRequested()) {
        await new Promise((resolve) => setTimeout(resolve, reconnectDelay))
      }
    }

    reconnecting = false
  }

  const handleMessage = (message: StateMessage) => {
    const result = state.applyStateMessage(message)
    if (result.status === 'applied' && result.messageType === 'snapshot') {
      resolveInitialSnapshot()
    }
    if (result.status === 'reconnect-needed') {
      void reconnect()
    }
  }

  await establishConnection()
  await initialSnapshot

  return async () => {
    controller.abort()
    await client.disconnectState()
  }
}
