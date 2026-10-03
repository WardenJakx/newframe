export interface TabLike {
  id?: number
  url?: string
}

export type MessageSender = Pick<chrome.runtime.MessageSender, 'frameId' | 'origin' | 'url'> & {
  tab?: Pick<chrome.tabs.Tab, 'id' | 'favIconUrl'>
}

/**
 * Who sent a runtime message, derived from browser-provided sender data.
 * Only the settings panel may name a tab in its payload; pages never choose their identity.
 */
export type MessageSource =
  | { kind: 'page'; tabId: number; frameId?: number; origin: string; favIconUrl?: string }
  | { kind: 'settings'; tab?: TabLike }
  | { kind: 'unknown' }

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function tabFromMessage(value: unknown): TabLike | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = typeof value.id === 'number' ? value.id : undefined
  const url = typeof value.url === 'string' ? value.url : undefined
  return id === undefined && url === undefined ? undefined : { id, url }
}

export const originFromUrl = (url?: string) => {
  if (!url) {
    return ''
  }
  const path = url.split('/')
  return `${path[0]}//${path[2]}`
}

export function messageSource(
  sender: MessageSender,
  payloadTab: unknown,
  settingsUrl: string
): MessageSource {
  if (sender.tab) {
    // sender.origin is the browser's security origin for the sending frame; opaque
    // origins (sandboxed frames) get no identity
    const { origin } = sender
    if (sender.tab.id === undefined || !origin || origin === 'null') {
      return { kind: 'unknown' }
    }
    return {
      kind: 'page',
      tabId: sender.tab.id,
      frameId: sender.frameId,
      origin,
      favIconUrl: sender.tab.favIconUrl
    }
  }
  if (sender.url === settingsUrl) {
    return { kind: 'settings', tab: tabFromMessage(payloadTab) }
  }
  return { kind: 'unknown' }
}
