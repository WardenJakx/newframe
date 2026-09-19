import { beforeEach, describe, expect, it, type Mock } from 'bun:test'

import { globalShortcut } from 'electron'

import type { Shortcut } from '../../features/settings/domain/state/shortcuts'

let registerShortcut: typeof import('./keyboardShortcuts').registerShortcut

describe('registerShortcut', () => {
  const shortcut: Shortcut = {
    shortcutKey: 'Slash',
    modifierKeys: ['Alt'],
    enabled: true,
    configuring: false
  }

  beforeEach(async () => {
    const keyboardShortcuts = await import('./keyboardShortcuts')
    registerShortcut = keyboardShortcuts.registerShortcut
  })

  it('should unregister an existing shortcut', () => {
    registerShortcut(shortcut, () => {})

    expect(globalShortcut.unregister).toHaveBeenCalledWith('Alt+/')
    expect(globalShortcut.unregister).toHaveBeenCalledTimes(1)
  })

  it('should register the new shortcut', () => {
    ;(globalShortcut.register as Mock<typeof globalShortcut.register>).mockImplementationOnce(
      (_accelerator, handlerFn) => {
        handlerFn()
        return true
      }
    )

    return new Promise<void>((resolve) => {
      const handlerFn = (accelerator: string) => {
        expect(accelerator).toBe('Alt+/')
        resolve()
      }
      registerShortcut(shortcut, handlerFn)

      expect(globalShortcut.register).toHaveBeenCalledWith('Alt+/', expect.any(Function))
      expect(globalShortcut.register).toHaveBeenCalledTimes(1)
    })
  })
})
