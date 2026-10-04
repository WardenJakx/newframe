import log from 'electron-log'
import WebSocket, { type ClientOptions } from 'ws'

export type HttpFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class OutboundClosedError extends Error {
  constructor() {
    super('Outbound traffic is closed')
    this.name = 'OutboundClosedError'
  }
}

/** Loopback never leaves the computer, so it stays reachable while outbound traffic is closed. */
function isLoopbackUrl(input: string | URL) {
  const hostname = new URL(input).hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
}

/**
 * The one way out of the core. Every outbound HTTP request and WebSocket starts
 * here, so whether Newframe may reach a remote service is decided in one place.
 * It starts closed. While closed it refuses new remote traffic; requests already
 * sent are left to finish, and their owners close their own long-lived sockets.
 */
export function createOutbound(remote: HttpFetch) {
  let open = false
  const listeners = new Set<(open: boolean) => void>()

  const admit = (url: string | URL) => {
    if (!open && !isLoopbackUrl(url)) {
      throw new OutboundClosedError()
    }
  }

  const request: HttpFetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input
    admit(url)
    return isLoopbackUrl(url) ? fetch(input, init) : remote(input, init)
  }

  return {
    isOpen: () => open,
    setOpen(next: boolean) {
      if (next === open) {
        return
      }
      open = next
      // One failing listener must not stop the others from pausing or resuming.
      listeners.forEach((listener) => {
        try {
          listener(open)
        } catch (error) {
          log.error('Outbound listener failed', error)
        }
      })
    },
    subscribe(listener: (open: boolean) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    request,
    openWebSocket(url: string, options?: ClientOptions) {
      admit(url)
      return new WebSocket(url, [], options)
    }
  }
}

export type Outbound = ReturnType<typeof createOutbound>
export type OutboundGate = Pick<Outbound, 'isOpen' | 'subscribe'>

// Remote traffic uses Chromium's network stack, so the session's proxy (and later Tor)
// applies to it. Cookies are omitted so a remote service cannot tie requests together.
// Electron is imported lazily: the balance worker loads this module outside Electron
// and only ever calls loopback.
export const outbound = createOutbound(async (input, init) => {
  const { net } = await import('electron')
  return net.fetch(input instanceof URL ? input.href : input, { ...init, credentials: 'omit' })
})
