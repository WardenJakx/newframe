import windows from '../windows'

export function closeOwnSideTray(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>) {
  setTimeout(() => windows.close(event), 0)
}

export function inspectOwnSideTray(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>, x: number, y: number) {
  if (process.env.NODE_ENV === 'development') event.sender.inspectElement(x, y)
}
