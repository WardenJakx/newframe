import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'

import type { NewframeHost } from '../../../resources/bridge/contracts'
import link from '../../../resources/link'

type ActionHandler = (...args: unknown[]) => void

const makeHost = (overrides: Partial<NewframeHost> = {}) => {
  const actionHandlers: ActionHandler[] = []

  const host: NewframeHost = {
    send: jest.fn(() => undefined) as NewframeHost['send'],
    invoke: jest.fn(async () => undefined) as NewframeHost['invoke'],
    rpc: jest.fn(async () => []) as NewframeHost['rpc'],
    onAction: jest.fn((handler: ActionHandler) => {
      actionHandlers.push(handler)
      return () => undefined
    }) as NewframeHost['onAction'],
    ...overrides
  }

  return { actionHandlers, host }
}

const setWindow = (host?: NewframeHost) => {
  const postMessage = jest.fn()
  ;(globalThis as any).window = { __NEWFRAME_HOST__: host, postMessage }
  return postMessage
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  jest.clearAllMocks()
  link.removeAllListeners()
})

afterEach(() => {
  link.removeAllListeners()
  delete (globalThis as any).window
})

describe('resources/link', () => {
  it('delegates send calls to the hidden host', () => {
    const { host } = makeHost()
    setWindow(host)

    link.send('tray:ready', 'first', { second: true })

    expect(host.send).toHaveBeenCalledWith('tray:ready', ['first', { second: true }])
  })

  it('delegates invoke calls to the hidden host and returns its promise', async () => {
    const response = { symbol: 'ETH' }
    const promise = Promise.resolve(response)
    const invoke = jest.fn(() => promise) as NewframeHost['invoke']
    const { host } = makeHost({ invoke })
    setWindow(host)

    const result = link.invoke('tray:getTokenDetails', '0xabc', 1)

    expect(result).toBe(promise)
    expect(host.invoke).toHaveBeenCalledWith('tray:getTokenDetails', ['0xabc', 1])
    expect(await result).toBe(response)
  })

  it('passes multiple rpc response args to the callback', async () => {
    const rpc = jest.fn(async () => [undefined, 'value', { ok: true }]) as NewframeHost['rpc']
    const { host } = makeHost({ rpc })
    const callback = jest.fn()
    setWindow(host)

    link.rpc('getState', 'request', callback)
    await flushPromises()

    expect(host.rpc).toHaveBeenCalledWith('getState', ['request'])
    expect(callback).toHaveBeenCalledWith(undefined, 'value', { ok: true })
  })

  it('passes rpc errors to the callback', async () => {
    const error = new Error('boom')
    const rpc = jest.fn(async () => {
      throw error
    }) as NewframeHost['rpc']
    const { host } = makeHost({ rpc })
    const callback = jest.fn()
    setWindow(host)

    link.rpc('getState', callback)
    await flushPromises()

    expect(callback).toHaveBeenCalledWith(error)
  })

  it('requires an rpc callback', () => {
    const { host } = makeHost()
    setWindow(host)

    expect(() => link.rpc('getState')).toThrow('link.rpc requires a callback')
    expect(host.rpc).not.toHaveBeenCalled()
  })

  it('delivers action payloads through host.onAction', () => {
    const { actionHandlers, host } = makeHost()
    const handler = jest.fn()
    const secondHandler = jest.fn()
    setWindow(host)

    link.on('action', handler)
    link.on('action', secondHandler)
    actionHandlers[0]('navHome', { view: 'accounts' }, 2)

    expect(host.onAction).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('navHome', { view: 'accounts' }, 2)
    expect(secondHandler).toHaveBeenCalledWith('navHome', { view: 'accounts' }, 2)
  })

  it('throws when the hidden host is missing', () => {
    setWindow()

    expect(() => link.send('tray:ready')).toThrow('Newframe host bridge is unavailable')
  })

  it('does not use window.postMessage', async () => {
    const rpc = jest.fn(async () => [undefined, 'ok']) as NewframeHost['rpc']
    const invoke = jest.fn(async () => 'ok') as NewframeHost['invoke']
    const { host } = makeHost({ invoke, rpc })
    const postMessage = setWindow(host)
    const callback = jest.fn()

    link.send('tray:ready')
    await link.invoke('tray:hydrateChainIcon', 1)
    link.rpc('getState', callback)
    await flushPromises()

    expect(postMessage).not.toHaveBeenCalled()
  })
})
