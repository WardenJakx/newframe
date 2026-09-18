import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { useEffect, useRef, useState } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import type { QrCameraCapability } from '../../../../platform/desktop/renderer/camera'

function cameraErrorMessage(reason: Error) {
  if (reason.name === 'NotAllowedError' || reason.name === 'SecurityError') {
    return 'Camera access denied. Allow Newframe in system Settings > Privacy & Security > Camera, then retry.'
  }
  if (reason.name === 'NotFoundError' || reason.name === 'TypeError') {
    return 'No camera available. Connect a camera and retry, or cancel.'
  }
  if (reason.name === 'NotReadableError') {
    return 'Camera is busy or unavailable. Close other camera apps and retry.'
  }
  return reason.message || 'Could not scan this QR. Retry or cancel.'
}

const previewRecipe = cva({ base: { width: '100%', maxHeight: '240px', borderRadius: 'control' } })

export function QrScanner({
  active,
  camera,
  onFrame,
  onReady,
  onError
}: {
  active: boolean
  camera: QrCameraCapability
  onFrame(frame: string): Promise<void>
  onReady?(): void
  onError(message: string): void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const callbacks = useRef({ onFrame, onReady, onError })
  useEffect(() => {
    callbacks.current = { onFrame, onReady, onError }
  }, [onFrame, onReady, onError])
  const inFlight = useRef(false)
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!active || !visible || !video.current) {
      return
    }
    let current = true
    let ready = false
    let lastFrame = ''
    let session: ReturnType<QrCameraCapability['start']> | undefined
    const fail = (reason: Error) => {
      if (!current) {
        return
      }
      current = false
      session?.stop()
      callbacks.current.onError(cameraErrorMessage(reason))
    }
    try {
      session = camera.start(video.current, {
        onError: fail,
        onReady: () => {
          if (!current) {
            return
          }
          ready = true
          callbacks.current.onReady?.()
        },
        onFrame: (frame) => {
          if (!current || !ready || inFlight.current || frame === lastFrame) {
            return
          }
          lastFrame = frame
          inFlight.current = true
          void Promise.resolve()
            .then(() => {
              if (current) {
                return callbacks.current.onFrame(frame)
              }
            })
            .catch(fail)
            .finally(() => {
              inFlight.current = false
            })
        }
      })
      if (!current) {
        session.stop()
      }
    } catch (reason) {
      fail(reason instanceof Error ? reason : new Error('Camera unavailable'))
    }
    return () => {
      current = false
      session?.stop()
    }
  }, [active, visible, camera])
  return (
    <Stack gap='small'>
      <video aria-label='QR camera preview' className={previewRecipe()} muted playsInline ref={video} />
      <Text variant='supporting'>{active && visible ? 'Hold the QR in view' : 'Camera paused'}</Text>
    </Stack>
  )
}
