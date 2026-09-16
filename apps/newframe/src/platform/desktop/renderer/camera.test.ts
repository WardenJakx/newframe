import { expect, it } from 'bun:test'

import QRCode from 'qrcode'

import { createQrCameraCapability } from './camera'

function cameraFixture() {
  let resolve!: (stream: MediaStream) => void
  let reject!: (error: Error) => void
  let acquired: MediaStreamConstraints | undefined
  const listeners = new Set<EventListenerOrEventListenerObject>()
  let stopped = 0
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped++
        },
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
          listeners.delete(listener)
      }
    ]
  } as unknown as MediaStream
  const video = {
    srcObject: null,
    videoWidth: 1920,
    videoHeight: 1080,
    play: async () => {}
  } as unknown as HTMLVideoElement
  const qr = QRCode.create('public QR fixture', { errorCorrectionLevel: 'M' })
  const width = (qr.modules.size + 8) * 6
  const data = new Uint8ClampedArray(width * width * 4)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / 6) - 4
      const col = Math.floor(x / 6) - 4
      const black =
        row >= 0 && col >= 0 && row < qr.modules.size && col < qr.modules.size && qr.modules.get(row, col)
      const offset = (y * width + x) * 4
      data.fill(black ? 0 : 255, offset, offset + 3)
      data[offset + 3] = 255
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => ({ data, width, height: width })
    })
  } as unknown as HTMLCanvasElement
  const camera = createQrCameraCapability({
    getUserMedia: (constraints) => {
      acquired = constraints
      return new Promise((yes, no) => {
        resolve = yes
        reject = no
      })
    },
    createCanvas: () => canvas
  })
  const frames: string[] = []
  const errors: Error[] = []
  let ready = 0
  const session = camera.start(video, {
    onReady: () => {
      ready++
    },
    onFrame: (frame) => frames.push(frame),
    onError: (error) => errors.push(error)
  })
  return {
    session,
    stream,
    video,
    canvas,
    frames,
    errors,
    ready: () => ready,
    listeners,
    resolve: () => resolve(stream),
    reject: (error: Error) => reject(error),
    acquired: () => acquired,
    stopped: () => stopped
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

it('does not request permission when stopped before acquisition starts', async () => {
  const f = cameraFixture()
  f.session.stop()
  await flush()
  expect(f.acquired()).toBeUndefined()
  expect(f.errors).toEqual([])
})

it('stops every track from a late permission result without attaching it', async () => {
  const f = cameraFixture()
  await flush()
  expect(f.acquired()?.audio).toBe(false)
  f.session.stop()
  f.resolve()
  await flush()
  f.session.stop()
  expect(f.video.srcObject).toBeNull()
  expect(f.stopped()).toBe(1)
  expect(f.frames).toEqual([])
  expect(f.ready()).toBe(0)
})

it('decodes real QR pixels at bounded dimensions and releases tracks and listeners', async () => {
  const f = cameraFixture()
  await flush()
  f.resolve()
  await flush()
  expect(f.frames).toEqual(['public QR fixture'])
  expect(f.ready()).toBe(1)
  expect(f.canvas.width).toBe(640)
  expect(f.canvas.height).toBe(360)
  expect(f.video.srcObject).toBe(f.stream)
  f.session.stop()
  f.session.stop()
  expect(f.video.srcObject).toBeNull()
  expect(f.stopped()).toBe(1)
  expect(f.listeners.size).toBe(0)
})

it('reports permission denial and playback failures without leaving streams alive', async () => {
  const denied = cameraFixture()
  await flush()
  denied.reject(new DOMException('Permission denied', 'NotAllowedError'))
  await flush()
  expect(denied.errors[0]?.name).toBe('NotAllowedError')
  expect(denied.ready()).toBe(0)
  const failed = cameraFixture()
  failed.video.play = async () => {
    throw new Error('Camera busy')
  }
  await flush()
  failed.resolve()
  await flush()
  expect(failed.errors[0]?.message).toBe('Camera busy')
  expect(failed.stopped()).toBe(1)
  expect(failed.video.srcObject).toBeNull()
  expect(failed.ready()).toBe(0)
})

it.each([false, true])('waits for playback before reporting ready, cancelled=%s', async (cancelled) => {
  const f = cameraFixture()
  let playing!: () => void
  f.video.play = () =>
    new Promise<void>((resolve) => {
      playing = resolve
    })
  await flush()
  f.resolve()
  await flush()
  expect(f.ready()).toBe(0)
  expect(f.frames).toEqual([])
  if (cancelled) {
    f.session.stop()
  }
  playing()
  await flush()
  expect(f.ready()).toBe(cancelled ? 0 : 1)
  f.session.stop()
  expect(f.stopped()).toBe(1)
})
