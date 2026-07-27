export interface SideTrayWindowCapability {
  close(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>): void
  inspect(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>, x: number, y: number): void
}

export function createSideTrayWorkflows(windows: SideTrayWindowCapability) {
  return {
    closeOwnSideTray(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>) {
      windows.close(event)
    },
    inspectOwnSideTray(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>, x: number, y: number) {
      windows.inspect(event, x, y)
    }
  }
}

export type SideTrayWorkflows = ReturnType<typeof createSideTrayWorkflows>
