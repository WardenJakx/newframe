import { afterEach, describe, expect, it, mock } from 'bun:test'

import { getMetaMaskSetting, isSupportedTab, refreshCurrentChain, toggleMetaMaskSetting } from './tabSettings'

const originals = new Map<string, PropertyDescriptor | undefined>()
function stubGlobal(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  originals.clear()
})

describe('tab settings', () => {
  it('requires a tab ID and an injectable protocol', () => {
    for (const url of ['https://example.com', 'http://localhost', 'file:///tmp/site.html']) {
      expect(isSupportedTab({ id: 0, url } as chrome.tabs.Tab)).toBe(true)
    }
    for (const url of ['chrome://extensions', 'https-fake://example.com', 'filebogus://site']) {
      expect(isSupportedTab({ id: 7, url } as chrome.tabs.Tab)).toBe(false)
    }
    expect(isSupportedTab()).toBe(false)
    expect(isSupportedTab({ url: 'https://example.com' } as chrome.tabs.Tab)).toBe(false)
  })

  it('reads legacy settings, gives the new key precedence, and awaits persistence before closing', async () => {
    const values = new Map([['__frameAppearAsMM__', 'true']])
    const reload = mock(() => {})
    const close = mock(() => {})
    stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    })
    stubGlobal('window', { location: { reload }, close })
    const executeScript = mock(
      async ({
        target,
        func,
        args
      }: {
        target: { tabId: number }
        func: (...args: string[]) => unknown
        args: string[]
      }) => {
        expect(target.tabId).toBe(7)
        expect(close).not.toHaveBeenCalled()
        await Promise.resolve()
        return [{ result: func(...args) }]
      }
    )
    stubGlobal('chrome', { scripting: { executeScript } })

    expect(await getMetaMaskSetting(7)).toBe(true)
    values.set('__newframeAppearAsMM__', 'false')
    expect(await getMetaMaskSetting(7)).toBe(false)
    const pending = toggleMetaMaskSetting(7)
    expect(close).not.toHaveBeenCalled()
    await pending
    expect(values.get('__newframeAppearAsMM__')).toBe('true')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('handles missing content scripts and keeps the popup open when a write fails', async () => {
    const fail = mock(async () => {
      throw new Error('Cannot access this page')
    })
    const close = mock(() => {})
    stubGlobal('chrome', { scripting: { executeScript: fail }, tabs: { sendMessage: fail } })
    stubGlobal('window', { close })
    expect(await getMetaMaskSetting(7)).toBe(false)
    await refreshCurrentChain(7)
    await expect(toggleMetaMaskSetting(7)).rejects.toThrow('Cannot access this page')
    expect(close).not.toHaveBeenCalled()
  })
})
