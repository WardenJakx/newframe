type BroadcastWebContents = {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

export type BroadcastWindow = {
  isDestroyed(): boolean
  webContents: BroadcastWebContents
}

export function sendToWindow(window: BroadcastWindow | undefined, channel: string, ...args: unknown[]) {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false

  window.webContents.send(channel, ...args)
  return true
}

export function broadcastToWindows(
  windows: Record<string, BroadcastWindow>,
  channel: string,
  ...args: unknown[]
) {
  Object.values(windows).forEach((window) => sendToWindow(window, channel, ...args))
}
