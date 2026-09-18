import { metaKeyMap, shortcutKeyMap, type Platform } from '../../../shared/domain/keyboard'
import type { Shortcut, ShortcutKey, ModifierKey } from '../domain/state/shortcuts'

type KeyboardLayout = {
  get: (key: string) => string
}

type KeyboardEventLike = {
  altKey: boolean
  code: string
  ctrlKey: boolean
  metaKey: boolean
}

let keyboardLayout: KeyboardLayout | undefined

const runtimeGlobal: { navigator?: Navigator } = globalThis

if (runtimeGlobal.navigator) {
  runtimeGlobal.navigator.keyboard
    .getLayoutMap()
    .then((layout) => {
      keyboardLayout = layout
    })
    .catch((error: unknown) => console.error('Could not load keyboard layout', error))

  // TODO: keyboard layoutchange event listener when Electron supports it
  // navigator.keyboard.addEventListener('layoutchange', () => { keyboardLayout = layout })
}

export const isShortcutKey = (keyEvent: KeyboardEventLike) => keyEvent.code in shortcutKeyMap

function getModifierKey(key: ModifierKey, platform: Platform) {
  const isMacOS = platform === 'darwin'

  if (key === 'Alt') {
    return isMacOS ? 'Option' : 'Alt'
  }

  if (key === 'Control' || key === 'CommandOrCtrl') {
    return isMacOS ? 'Control' : 'Ctrl'
  }

  switch (key) {
    case 'Meta':
    case 'Super':
      return metaKeyMap[platform]
  }

  return key
}

export const getDisplayShortcut = (platform: Platform, shortcut: Shortcut) => {
  const mappedKey = keyboardLayout?.get(shortcut.shortcutKey)
  const key = mappedKey ? (mappedKey as ShortcutKey) : shortcut.shortcutKey

  const shortcutKey =
    key.length === 1 && key.charCodeAt(0) >= 65 && key.charCodeAt(0) <= 122 ? key.toLocaleUpperCase() : key
  const modifierKeys = shortcut.modifierKeys.map((key) => {
    const mappedKey = keyboardLayout?.get(key)
    return getModifierKey(mappedKey ? (mappedKey as ModifierKey) : key, platform)
  })

  return { modifierKeys, shortcutKey }
}

export const getShortcutFromKeyEvent = (
  e: KeyboardEventLike,
  pressedKeyCodes: number[],
  platform: Platform
) => {
  const isWindows = platform === 'win32'
  const altGrPressed = !e.altKey && pressedKeyCodes.includes(17) && pressedKeyCodes.includes(18)
  const modifierKeys = []

  if (isWindows && altGrPressed) {
    modifierKeys.push('Alt', 'Control')
  }
  if (e.altKey) {
    modifierKeys.push('Alt')
  }
  if (e.ctrlKey) {
    modifierKeys.push('Control')
  }
  if (e.metaKey) {
    modifierKeys.push('Meta')
  }

  return {
    modifierKeys,
    shortcutKey: e.code
  }
}
