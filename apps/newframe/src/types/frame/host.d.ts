import type { NewframeHost } from '../../platform/ipc/contract/ipc'

declare global {
  interface Window {
    __NEWFRAME_HOST__?: NewframeHost
  }
}

export {}
