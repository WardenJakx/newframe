import link from '../../resources/link'
import type { RendererProjection } from '../../resources/state/projections'
import type { StateMessage } from '../../resources/state/protocol'
import { applyStateMessage, beginStateConnection } from './rendererStore'

const reconnectDelay = 250

export async function connectRendererState(projection: RendererProjection) {
  let stopped = false
  let reconnecting = false
  let retryRequested = false
  let resolveInitialSnapshot!: () => void
  const initialSnapshot = new Promise<void>((resolve) => {
    resolveInitialSnapshot = resolve
  })

  const establishConnection = async () => {
    beginStateConnection(projection)
    const result = await link.connectState(handleMessage)
    if (!result.ok) throw new Error(`State connection failed: ${result.error}`)
  }

  const reconnect = async () => {
    retryRequested = true
    if (reconnecting || stopped) return
    reconnecting = true

    while (!stopped) {
      retryRequested = false
      try {
        await link.disconnectState()
        if (stopped) break
        await establishConnection()
        if (stopped) {
          await link.disconnectState()
          break
        }
        if (!retryRequested) break
      } catch (error) {
        console.error('Could not reconnect renderer state', error)
        retryRequested = true
      }

      if (retryRequested) await new Promise((resolve) => setTimeout(resolve, reconnectDelay))
    }

    reconnecting = false
  }

  const handleMessage = (message: StateMessage) => {
    const result = applyStateMessage(message)
    if (result.status === 'applied' && result.messageType === 'snapshot') resolveInitialSnapshot()
    if (result.status === 'reconnect-needed') void reconnect()
  }

  await establishConnection()
  await initialSnapshot

  return async () => {
    stopped = true
    await link.disconnectState()
  }
}
