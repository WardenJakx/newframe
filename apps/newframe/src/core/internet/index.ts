import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'

import { Agent, type AgentConnectOpts } from 'agent-base'
import log from 'electron-log'
import { SocksProxyAgent } from 'socks-proxy-agent'
import WebSocket, { type ClientOptions } from 'ws'

export type HttpFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class InternetClosedError extends Error {
  constructor() {
    super('The internet is closed')
    this.name = 'InternetClosedError'
  }
}

/** Loopback never leaves the computer, so it stays reachable while the internet is closed. */
function isLoopbackHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

const isLoopbackUrl = (input: string | URL) => isLoopbackHostname(new URL(input).hostname)

/** A Node http(s) agent that picks, per connection, the agent the connection should use. */
class RoutedAgent extends Agent {
  constructor(private readonly pick: (hostname: string) => http.Agent) {
    super()
  }

  override connect(_request: http.ClientRequest, options: AgentConnectOpts) {
    // Node connects to localhost when a request names no host.
    return this.pick(options.host ?? 'localhost')
  }
}

/**
 * How remote traffic leaves the computer. Over Tor, `socksPort` is null until Tor has
 * connected, and remote traffic is held closed until then rather than sent directly.
 */
export type InternetRoute = { via: 'direct' } | { via: 'tor'; socksPort: number | null }

/**
 * The one way out of the core. Every internet request and WebSocket starts
 * here, so whether Newframe may reach a remote service is decided in one place.
 * It starts closed, and is open only while the lock allows it and the route is ready.
 * While closed it refuses new remote traffic; requests already sent are left to
 * finish, and their owners close their own long-lived sockets.
 */
export function createInternet(remote: HttpFetch) {
  let unlocked = false
  let route: InternetRoute = { via: 'direct' }
  let open = false
  const listeners = new Set<(open: boolean) => void>()

  const update = () => {
    const next = unlocked && (route.via === 'direct' || route.socksPort !== null)
    if (next === open) {
      return
    }
    open = next
    // One failing listener must not stop the others from pausing or resuming.
    listeners.forEach((listener) => {
      try {
        listener(open)
      } catch (error) {
        log.error('Internet listener failed', error)
      }
    })
  }

  const admit = (url: string | URL) => {
    if (!open && !isLoopbackUrl(url)) {
      throw new InternetClosedError()
    }
  }

  // The internet is only open over Tor once Tor has connected, so an admitted remote connection always has a port.
  const socksPort = () => (route.via === 'tor' ? route.socksPort : null)
  const socksAgents = new Map<number, SocksProxyAgent>()
  // socks5h resolves names inside Tor.
  const socksAgent = (port: number) => {
    let agent = socksAgents.get(port)
    if (!agent) {
      agent = new SocksProxyAgent(`socks5h://127.0.0.1:${port}`)
      socksAgents.set(port, agent)
    }
    return agent
  }

  const request: HttpFetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input
    admit(url)
    return isLoopbackUrl(url) ? fetch(input, init) : remote(input, init)
  }

  return {
    isOpen: () => open,
    /** The lock's half of the decision. */
    setOpen(next: boolean) {
      unlocked = next
      update()
    },
    route: () => route,
    setRoute(next: InternetRoute) {
      route = next
      update()
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
      // ws dials its own sockets, so Chromium's proxy does not apply.
      const port = isLoopbackUrl(url) ? null : socksPort()
      return new WebSocket(url, [], port === null ? options : { ...options, agent: socksAgent(port) })
    },
    /** Wraps a Node http(s) agent so connections made with it follow the lock and route. */
    nodeAgent(direct: http.Agent): Agent {
      return new RoutedAgent((hostname) => {
        if (isLoopbackHostname(hostname)) {
          return direct
        }
        admit(`https://${hostname.includes(':') ? `[${hostname}]` : hostname}`)
        const port = socksPort()
        return port === null ? direct : socksAgent(port)
      })
    }
  }
}

export type Internet = ReturnType<typeof createInternet>
export type InternetGate = Pick<Internet, 'isOpen' | 'subscribe'>

// Remote traffic uses Chromium's network stack, so the session's proxy (Tor, when on)
// applies to it. Cookies are omitted so a remote service cannot tie requests together.
// Electron is imported lazily: the balance worker loads this module outside Electron
// and only ever calls loopback.
export const internet = createInternet(async (input, init) => {
  const { net } = await import('electron')
  return net.fetch(input instanceof URL ? input.href : input, { ...init, credentials: 'omit' })
})

/**
 * Makes the internet Node's default way out, so libraries that use the global fetch or
 * Node's default agents (the Lattice and Trezor SDKs) follow the lock and route too.
 * Called once by the main process; the balance worker only ever calls loopback.
 */
export function installInternetDefaults() {
  const native = globalThis.fetch.bind(globalThis)
  // Loopback goes straight to the native fetch, since the internet's own loopback path calls the global.
  // Bun's fetch type adds preconnect; a no-op keeps it from opening a connection around the internet.
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input
      return isLoopbackUrl(url) ? native(input, init) : internet.request(input, init)
    },
    { preconnect: () => {} }
  )
  http.globalAgent = internet.nodeAgent(http.globalAgent)
  // agent-base agents serve https too: they see whether each connection is secure.
  https.globalAgent = internet.nodeAgent(https.globalAgent)
  syncBuiltinESMExports()
}
