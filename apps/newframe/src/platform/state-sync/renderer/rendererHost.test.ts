import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createRendererClient, installRendererHost } from '../../../../test/support/rendererClient'

describe('renderer host installation', () => {
  let originalWindow: PropertyDescriptor | undefined

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'window')
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  })

  it('removes an owned window after LIFO disposal', () => {
    const [first, second] = [createRendererClient(), createRendererClient()]
    const [disposeFirst, disposeSecond] = [installRendererHost(first), installRendererHost(second)]

    expect(window.__NEWFRAME_HOST__).toBe(second)
    disposeSecond()
    expect(window.__NEWFRAME_HOST__).toBe(first)
    disposeFirst()
    expect(typeof window).toBe('undefined')
  })

  it('keeps the newer owner and removes an owned window after out-of-order disposal', () => {
    const [first, second] = [createRendererClient(), createRendererClient()]
    const [disposeFirst, disposeSecond] = [installRendererHost(first), installRendererHost(second)]

    disposeFirst()
    expect(window.__NEWFRAME_HOST__).toBe(second)
    disposeSecond()
    expect(typeof window).toBe('undefined')
  })

  it('restores an existing prior host after LIFO disposal', () => {
    const [prior] = [createRendererClient()]
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __NEWFRAME_HOST__: prior }
    })
    const [first, second] = [createRendererClient(), createRendererClient()]
    const [disposeFirst, disposeSecond] = [installRendererHost(first), installRendererHost(second)]

    disposeSecond()
    expect(window.__NEWFRAME_HOST__).toBe(first)
    disposeFirst()
    expect(window.__NEWFRAME_HOST__).toBe(prior)
  })

  it('skips a disposed install when restoring an existing prior host', () => {
    const [prior] = [createRendererClient()]
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __NEWFRAME_HOST__: prior }
    })
    const [first, second] = [createRendererClient(), createRendererClient()]
    const [disposeFirst, disposeSecond] = [installRendererHost(first), installRendererHost(second)]

    disposeFirst()
    expect(window.__NEWFRAME_HOST__).toBe(second)
    disposeSecond()
    expect(window.__NEWFRAME_HOST__).toBe(prior)
  })
})
