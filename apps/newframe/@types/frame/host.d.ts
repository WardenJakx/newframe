import type { NewframeHost } from '../../resources/bridge/contracts'

declare global {
  interface Window {
    __NEWFRAME_HOST__?: NewframeHost
  }
}

export {}
