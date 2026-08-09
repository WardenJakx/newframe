import { BrowserWindow, type IpcMainEvent } from 'electron'

type Schedule = (callback: () => void) => void

const scheduleNextTurn: Schedule = (callback) => setTimeout(callback, 0)

export function closeRendererWindow(
  event: Pick<IpcMainEvent, 'sender'>,
  schedule: Schedule = scheduleNextTurn
) {
  if (event.sender.isDestroyed()) return

  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return

  // Resolve the BrowserWindow while the invoking WebContents is still alive, then close only the
  // stable window reference after IPC has delivered its acknowledgement.
  schedule(() => {
    if (!window.isDestroyed()) window.close()
  })
}
