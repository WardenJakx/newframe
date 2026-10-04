import type { NewframeHost } from '@newframe/schema/tray-host'

declare global {
  interface Window {
    __NEWFRAME_HOST__?: NewframeHost
  }
}

export {}
