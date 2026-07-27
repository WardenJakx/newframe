import type { NewframeHost } from '../../contracts/ipc'

declare global {
  interface Window {
    __NEWFRAME_HOST__?: NewframeHost
  }
}

export {}
