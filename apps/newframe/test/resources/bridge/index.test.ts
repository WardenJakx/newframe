import { beforeEach, describe, expect, it, jest, mock, spyOn } from 'bun:test'

import type { NewframeHost } from '../../../resources/bridge/contracts'

type Listener = (...args: any[]) => void

const listeners = new Map<string, Listener[]>()
const contextBridge = {
  exposeInMainWorld: jest.fn()
}
const ipcRenderer = {
  invoke: jest.fn(),
  on: jest.fn((channel: string, listener: Listener) => {
    listeners.set(channel, [...(listeners.get(channel) || []), listener])
    return ipcRenderer
  }),
  removeListener: jest.fn((channel: string, listener: Listener) => {
    listeners.set(
      channel,
      (listeners.get(channel) || []).filter((current) => current !== listener)
    )
    return ipcRenderer
  }),
  send: jest.fn()
}

mock.module('electron', () => ({
  contextBridge,
  ipcRenderer,
  default: { contextBridge, ipcRenderer }
}))

let importCounter = 0

const loadHost = async () => {
  await import(`../../../resources/bridge/index?test=${importCounter++}`)

  return contextBridge.exposeInMainWorld.mock.calls.at(-1)?.[1] as NewframeHost
}

const emit = (channel: string, ...args: any[]) => {
  const channelListeners = [...(listeners.get(channel) || [])]

  channelListeners.forEach((listener) => listener(...args))
}

beforeEach(() => {
  listeners.delete('main:action')
  contextBridge.exposeInMainWorld.mockClear()
  ipcRenderer.invoke.mockReset()
  ipcRenderer.on.mockClear()
  ipcRenderer.removeListener.mockClear()
  ipcRenderer.send.mockClear()
})

describe('preload bridge host', () => {
  it('exposes the Newframe host through contextBridge', async () => {
    const host = await loadHost()

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('__NEWFRAME_HOST__', host)
    expect(typeof host.send).toBe('function')
    expect(typeof host.invoke).toBe('function')
    expect(typeof host.rpc).toBe('function')
    expect(typeof host.onAction).toBe('function')
  })

  it('forwards known send channels to ipcRenderer.send', async () => {
    const host = await loadHost()

    host.send('tray:clipboardData', ['0xabc'])

    expect(ipcRenderer.send).toHaveBeenCalledWith('tray:clipboardData', '0xabc')
  })

  it('warns and no-ops unknown send channels', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const host = await loadHost()

    host.send('tray:notReal' as any, ['payload'])

    expect(warn).toHaveBeenCalledWith('Unknown send channel: tray:notReal')
    expect(ipcRenderer.send).not.toHaveBeenCalled()

    warn.mockRestore()
  })

  it('forwards known invoke channels to ipcRenderer.invoke', async () => {
    const host = await loadHost()
    ipcRenderer.invoke.mockResolvedValueOnce({ symbol: 'ETH' })

    await expect(host.invoke('tray:getTokenDetails', ['0xabc', 1])).resolves.toEqual({
      symbol: 'ETH'
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('tray:getTokenDetails', '0xabc', 1)
  })

  it('rejects unknown invoke channels', async () => {
    const host = await loadHost()

    await expect(host.invoke('tray:notReal' as any, [])).rejects.toThrow(
      'Unknown invoke channel: tray:notReal'
    )
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('uses the promise RPC helper for known RPC methods', async () => {
    const host = await loadHost()
    const response = host.rpc('getState', [{ ready: true }, null])
    const sendCall = ipcRenderer.send.mock.calls.at(-1)

    expect(sendCall?.[0]).toBe('main:rpc')
    expect(sendCall?.[2]).toBe(JSON.stringify('getState'))
    expect(sendCall?.[3]).toBe(JSON.stringify({ ready: true }))
    expect(sendCall?.[4]).toBeNull()

    emit(
      'main:rpc',
      {},
      JSON.parse(sendCall?.[1] as string),
      JSON.stringify(null),
      JSON.stringify({ ok: true })
    )

    await expect(response).resolves.toEqual([null, { ok: true }])
  })

  it('rejects unknown RPC methods', async () => {
    const host = await loadHost()

    await expect(host.rpc('notReal' as any, [])).rejects.toThrow('Unknown RPC method: notReal')
    expect(ipcRenderer.send).not.toHaveBeenCalled()
  })

  it('strips the event object from main:action and removes the listener on cleanup', async () => {
    const host = await loadHost()
    const handler = jest.fn()

    const cleanup = host.onAction(handler)

    emit('main:action', { sender: 'main' }, 'approve', { id: 1 })

    expect(handler).toHaveBeenCalledWith('approve', { id: 1 })

    cleanup()
    emit('main:action', { sender: 'main' }, 'after-cleanup')

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('main:action', expect.any(Function))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
