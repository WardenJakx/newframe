import { describe, expect, it } from 'bun:test'

import { messageSource } from './messageSource.ts'

const settingsUrl = 'chrome-extension://abc/settings.html'
const forgedTab = { id: 99, url: 'https://victim.example/' }

describe('messageSource', () => {
  it('ignores a forged payload tab from a page', () => {
    const sender = {
      tab: { id: 7 },
      frameId: 0,
      origin: 'https://evil.example',
      url: 'https://evil.example/x'
    }

    expect(messageSource(sender, forgedTab, settingsUrl)).toStrictEqual({
      kind: 'page',
      tabId: 7,
      frameId: 0,
      origin: 'https://evil.example',
      favIconUrl: undefined
    })
  })

  it('takes identity from sender.origin, never the sender url', () => {
    const sender = { tab: { id: 7 }, origin: 'https://real.example', url: 'https://other.example/x' }

    expect(messageSource(sender, undefined, settingsUrl)).toMatchObject({ origin: 'https://real.example' })
    expect(
      messageSource({ tab: { id: 7 }, url: 'https://other.example/x' }, undefined, settingsUrl)
    ).toStrictEqual({
      kind: 'unknown'
    })
  })

  it('does not give opaque-origin frames the identity of their url', () => {
    const sender = { tab: { id: 7 }, origin: 'null', url: 'https://victim.example/sandboxed' }

    expect(messageSource(sender, undefined, settingsUrl)).toStrictEqual({ kind: 'unknown' })
  })

  it('honors the payload tab only from the settings panel', () => {
    expect(messageSource({ url: settingsUrl }, forgedTab, settingsUrl)).toStrictEqual({
      kind: 'settings',
      tab: forgedTab
    })
    expect(
      messageSource(
        { tab: { id: 7 }, origin: 'https://evil.example', url: settingsUrl },
        forgedTab,
        settingsUrl
      )
    ).toMatchObject({
      kind: 'page',
      tabId: 7
    })
    expect(messageSource({ url: 'chrome-extension://abc/other.html' }, forgedTab, settingsUrl)).toStrictEqual(
      {
        kind: 'unknown'
      }
    )
  })
})
