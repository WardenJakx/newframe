import { beforeEach, expect, it, mock } from 'bun:test'

import { BrowserWindow } from 'electron'
import { closeRendererWindow } from './close'

const fromWebContents = mock()

beforeEach(() => {
  ;(
    BrowserWindow as unknown as {
      fromWebContents: typeof fromWebContents
    }
  ).fromWebContents = fromWebContents
})

it('captures a live window before acknowledgement and ignores duplicate or destroyed closes', () => {
  let scheduled: (() => void) | undefined
  const close = mock()
  const windowDestroyed = mock(() => false)
  const window = { close, isDestroyed: windowDestroyed }
  const sender = { isDestroyed: mock(() => false) }
  fromWebContents.mockReturnValue(window)

  closeRendererWindow({ sender } as never, (callback) => {
    scheduled = callback
  })

  expect(fromWebContents).toHaveBeenCalledWith(sender)
  expect(close).not.toHaveBeenCalled()
  scheduled?.()
  expect(close).toHaveBeenCalledTimes(1)

  windowDestroyed.mockReturnValue(true)
  scheduled?.()
  expect(close).toHaveBeenCalledTimes(1)

  fromWebContents.mockClear()
  closeRendererWindow({ sender: { isDestroyed: () => true } } as never)
  expect(fromWebContents).not.toHaveBeenCalled()
})
