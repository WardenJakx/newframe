import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'

import type { NewframeHost } from '../../../resources/bridge/contracts'
import link from '../../../resources/link'

const makeHost = (overrides: Partial<NewframeHost> = {}): NewframeHost => ({
  executeCommand: jest.fn(async () => ({ ok: true })) as NewframeHost['executeCommand'],
  executeQuery: jest.fn(async () => ({ ok: false, error: 'not_found' })) as NewframeHost['executeQuery'],
  connectState: jest.fn(async () => ({ ok: true })) as NewframeHost['connectState'],
  disconnectState: jest.fn(async () => ({ ok: true })) as NewframeHost['disconnectState'],
  ...overrides
})

const setWindow = (host?: NewframeHost) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { __NEWFRAME_HOST__: host }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('resources/link', () => {
  it('exposes only typed command, query, and state capabilities', () => {
    expect(Object.keys(link).sort()).toEqual([
      'connectState',
      'disconnectState',
      'executeCommand',
      'executeQuery'
    ])
  })

  it('delegates typed commands and queries to the hidden host', async () => {
    const executeCommand = jest.fn(async () => ({ ok: true })) as NewframeHost['executeCommand']
    const executeQuery = jest.fn(async () => ({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })) as NewframeHost['executeQuery']
    const host = makeHost({ executeCommand, executeQuery })
    setWindow(host)

    await expect(link.executeCommand({ type: 'account.select', accountId: '0xabc' })).resolves.toEqual({
      ok: true
    })
    await expect(link.executeQuery({ type: 'name.resolve', name: 'alice.eth' })).resolves.toEqual({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })

    expect(executeCommand).toHaveBeenCalledWith({ type: 'account.select', accountId: '0xabc' })
    expect(executeQuery).toHaveBeenCalledWith({ type: 'name.resolve', name: 'alice.eth' })
  })

  it('delegates state connection lifecycle to the hidden host', async () => {
    const connectState = jest.fn(async () => ({ ok: true })) as NewframeHost['connectState']
    const disconnectState = jest.fn(async () => ({ ok: true })) as NewframeHost['disconnectState']
    const host = makeHost({ connectState, disconnectState })
    const handler = jest.fn()
    setWindow(host)

    await expect(link.connectState(handler)).resolves.toEqual({ ok: true })
    await expect(link.disconnectState()).resolves.toEqual({ ok: true })

    expect(connectState).toHaveBeenCalledWith(handler)
    expect(disconnectState).toHaveBeenCalledWith()
  })

  it('throws when the hidden host is missing', () => {
    setWindow()

    expect(() => link.executeCommand({ type: 'account.select', accountId: '0xabc' })).toThrow(
      'Newframe host bridge is unavailable'
    )
  })
})
