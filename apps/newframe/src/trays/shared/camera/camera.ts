import { decodeQR } from 'qr/decode.js'

export interface QrCameraCapability {
  start(
    video: HTMLVideoElement,
    handlers: { onReady(): void; onFrame(frame: string): void; onError(error: Error): void }
  ): { stop(): void }
}

type CameraBrowser = {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  createCanvas(): HTMLCanvasElement
}

export function createQrCameraCapability(
  browser: CameraBrowser = {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createCanvas: () => document.createElement('canvas')
  }
): QrCameraCapability {
  return {
    start(video, handlers) {
      const controller = new AbortController()
      const isStopped = () => controller.signal.aborted
      let stream: MediaStream | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      const stop = () => {
        if (isStopped()) {
          return
        }
        controller.abort()
        clearTimeout(timer)
        video.srcObject = null
        for (const track of stream?.getTracks() ?? []) {
          track.removeEventListener('ended', ended)
          track.stop()
        }
      }
      const fail = (error: unknown) => {
        if (isStopped()) {
          return
        }
        stop()
        handlers.onError(error instanceof Error ? error : new Error('Camera unavailable'))
      }
      const ended = () => fail(new Error('Camera disconnected. Connect it and retry.'))
      void Promise.resolve()
        .then(() =>
          isStopped()
            ? undefined
            : browser.getUserMedia({
                audio: false,
                video: { width: { ideal: 640 }, height: { ideal: 480 } }
              })
        )
        .then(async (media) => {
          if (!media) {
            return
          }
          if (isStopped()) {
            media.getTracks().forEach((track) => track.stop())
            return
          }
          stream = media
          stream.getTracks().forEach((track) => track.addEventListener('ended', ended))
          video.srcObject = stream
          await video.play()
          if (isStopped()) {
            return
          }
          const canvas = browser.createCanvas()
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) {
            throw new Error('Camera preview unavailable. Retry or cancel.')
          }
          handlers.onReady()
          const scan = () => {
            if (isStopped()) {
              return
            }
            try {
              if (video.videoWidth && video.videoHeight) {
                const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
                canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
                canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
                context.drawImage(video, 0, 0, canvas.width, canvas.height)
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
                let frame: string | undefined
                // A decoder miss is an ordinary camera frame.
                try {
                  frame = decodeQR(pixels, { timeLimit: 40 })
                } catch {
                  /* no QR */
                }
                if (frame) {
                  handlers.onFrame(frame)
                }
              }
            } catch (error) {
              fail(error)
            }
            if (!isStopped()) {
              timer = setTimeout(scan, 200)
            }
          }
          scan()
        })
        .catch(fail)
      return { stop }
    }
  }
}
