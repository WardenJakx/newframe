import { expect, it } from 'bun:test'

import { act, render, waitFor } from '../../../../../test/support/componentSetup'
import { createQrCameraFake } from '../../../../platform/desktop/renderer/camera.test-support'
import { QrScanner } from './QrScanner'

it('serializes scans, deduplicates adjacent frames, and permits multipart cycles', async () => {
  const f = createQrCameraFake(false)
  const frames: string[] = []
  const onError = () => {}
  let resolve!: () => void
  const onFrame = (frame: string) => {
    frames.push(frame)
    return new Promise<void>((done) => {
      resolve = done
    })
  }
  const view = render(<QrScanner active camera={f.camera} onFrame={onFrame} onError={onError} />)
  expect(f.sessions).toHaveLength(1)
  const emit = (frame: string) => act(() => f.sessions.at(-1)!.handlers.onFrame(frame))
  emit('too early')
  expect(frames).toEqual([])
  act(() => f.sessions[0].handlers.onReady())
  emit('part-a')
  await waitFor(() => expect(frames).toEqual(['part-a']))
  emit('part-b')
  emit('part-a')
  expect(frames).toEqual(['part-a'])
  await act(async () => resolve())
  emit('part-a')
  expect(frames).toEqual(['part-a'])
  emit('part-b')
  await waitFor(() => expect(frames).toEqual(['part-a', 'part-b']))
  await act(async () => resolve())
  emit('part-a')
  await waitFor(() => expect(frames).toEqual(['part-a', 'part-b', 'part-a']))
  await act(async () => resolve())
  view.rerender(<QrScanner active={false} camera={f.camera} onFrame={onFrame} onError={onError} />)
  expect(f.sessions[0].stopped).toBe(true)
  view.rerender(<QrScanner active camera={f.camera} onFrame={onFrame} onError={onError} />)
  expect(f.sessions.at(-1)?.stopped).toBe(false)
  view.unmount()
  expect(f.sessions.every((session) => session.stopped)).toBe(true)
})

it('stops on document hiding and resumes automatically when visible', async () => {
  const f = createQrCameraFake()
  const view = render(<QrScanner active camera={f.camera} onFrame={async () => {}} onError={() => {}} />)
  const original = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(f.sessions.at(-1)?.stopped).toBe(true)
  } finally {
    if (original) Object.defineProperty(document, 'visibilityState', original)
    else Reflect.deleteProperty(document, 'visibilityState')
    await act(() => document.dispatchEvent(new Event('visibilitychange')))
  }
  expect(f.sessions).toHaveLength(2)
  expect(f.sessions[1].stopped).toBe(false)
  view.unmount()
})
