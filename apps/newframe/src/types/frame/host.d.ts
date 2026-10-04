import type { NewframeHost } from '../../platform/ipc/contract/ipc.ts'

declare global {
  interface Window {
    __NEWFRAME_HOST__?: NewframeHost
  }
}

export {}
