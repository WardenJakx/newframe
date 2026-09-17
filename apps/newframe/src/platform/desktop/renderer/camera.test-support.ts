import type { QrCameraCapability } from './camera'

export function createQrCameraFake(autoReady = true) {
  const sessions: Array<{
    stopped: boolean
    handlers: Parameters<QrCameraCapability['start']>[1]
    video: HTMLVideoElement
  }> = []
  const camera: QrCameraCapability = {
    start(video, handlers) {
      const session = { video, handlers, stopped: false }
      sessions.push(session)
      if (autoReady) {
        queueMicrotask(() => {
          if (!session.stopped) {
            handlers.onReady()
          }
        })
      }
      return {
        stop() {
          session.stopped = true
        }
      }
    }
  }
  return { camera, sessions }
}
