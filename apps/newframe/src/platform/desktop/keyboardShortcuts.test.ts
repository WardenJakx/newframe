import { beforeEach, describe, expect, it, type mock } from 'bun:test'

import { globalShortcut } from 'electron'

let registerShortcut: typeof import('./keyboardShortcuts').registerShortcut
const globalShortcutRegisterMock = globalShortcut.register as unknown as ReturnType<
  typeof mock<typeof globalShortcut.register>
>

describe('registerShortcut', () => {
  const shortcut: Parameters<typeof import('./keyboardShortcuts').registerShortcut>[0] = {
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
    globalShortcutRegisterMock.mockImplementationOnce((_accelerator, handlerFn) => {
      handlerFn()
      return true
    })

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
