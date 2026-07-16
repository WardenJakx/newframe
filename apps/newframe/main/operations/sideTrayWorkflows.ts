import windows from '../windows'

export function closeOwnSideTrayWindow(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>) {
  setTimeout(() => windows.close(event), 0)
}

export function inspectOwnSideTrayWindow(
  event: Pick<Electron.IpcMainInvokeEvent, 'sender'>,
  x: number,
  y: number
) {
  if (process.env.NODE_ENV === 'development') event.sender.inspectElement(x, y)
}
