import { beforeEach, describe, expect, it, jest, mock } from 'bun:test'

import {
  ExecuteCommandChannel,
  ExecuteQueryChannel,
  type NewframeHost
} from '../../../resources/bridge/contracts'
import {
  StateConnectChannel,
  StateDisconnectChannel,
  StateMessageChannel,
  type StateMessage
} from '../../../resources/state/protocol'

type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Listener[]>()
const contextBridge = {
  exposeInMainWorld: jest.fn()
}
const ipcRenderer = {
  invoke: jest.fn(),
  on: jest.fn((channel: string, listener: Listener) => {
    listeners.set(channel, [...(listeners.get(channel) || []), listener])
    return ipcRenderer
  })
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

const emit = (channel: string, ...args: unknown[]) => {
  ;(listeners.get(channel) || []).forEach((listener) => listener(...args))
}

beforeEach(() => {
  listeners.clear()
  contextBridge.exposeInMainWorld.mockClear()
  ipcRenderer.invoke.mockReset()
  ipcRenderer.on.mockClear()
})

describe('preload bridge host', () => {
  it('exposes only the typed application capabilities', async () => {
    const host = await loadHost()

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('__NEWFRAME_HOST__', host)
    expect(Object.keys(host).sort()).toEqual([
      'connectState',
      'disconnectState',
      'executeCommand',
      'executeQuery'
    ])
  })

  it('executes commands over the fixed command channel', async () => {
    const host = await loadHost()
    const command = { type: 'account.select', accountId: '0xabc' } as const
    ipcRenderer.invoke.mockResolvedValueOnce({ ok: true })

    await expect(host.executeCommand(command)).resolves.toEqual({ ok: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(ExecuteCommandChannel, command)
  })

  it('executes queries over the fixed query channel', async () => {
    const host = await loadHost()
    const query = { type: 'name.resolve', name: 'alice.eth' } as const
    ipcRenderer.invoke.mockResolvedValueOnce({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })

    await expect(host.executeQuery(query)).resolves.toEqual({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(ExecuteQueryChannel, query)
  })

  it('connects the state stream and strips the Electron event from messages', async () => {
    const host = await loadHost()
    const handler = jest.fn()
    const snapshot: StateMessage = {
      schemaVersion: 1,
      streamId: 'stream-1',
      revision: 0,
      state: { selectedAccountId: '0xabc' }
    }
    ipcRenderer.invoke.mockResolvedValueOnce({ ok: true })

    await expect(host.connectState(handler)).resolves.toEqual({ ok: true })
    emit(StateMessageChannel, { sender: 'electron' }, snapshot)

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(StateConnectChannel)
    expect(handler).toHaveBeenCalledWith(snapshot)
  })

  it('disconnects the state stream and stops delivering messages', async () => {
    const host = await loadHost()
    const handler = jest.fn()
    const snapshot: StateMessage = {
      schemaVersion: 1,
      streamId: 'stream-1',
      revision: 0,
      state: {}
    }
    ipcRenderer.invoke.mockResolvedValue({ ok: true })

    await host.connectState(handler)
    emit(StateMessageChannel, {}, snapshot)
    await expect(host.disconnectState()).resolves.toEqual({ ok: true })
    emit(StateMessageChannel, {}, snapshot)

    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(StateDisconnectChannel)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid state connection results at the preload boundary', async () => {
    const host = await loadHost()
    ipcRenderer.invoke.mockResolvedValueOnce({ ok: true, unexpected: true })

    await expect(host.connectState(jest.fn())).rejects.toThrow()
  })
})
