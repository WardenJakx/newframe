import { beforeEach, describe, expect, it, type Mock } from 'bun:test'

import { electronMock } from '../../../test/support/electron.mock.ts'
import type { Shortcut } from '../../features/settings/domain/state/shortcuts.ts'

let registerShortcut: typeof import('./keyboardShortcuts.ts').registerShortcut
const { register, unregister } = electronMock.globalShortcut

describe('registerShortcut', () => {
  const shortcut: Shortcut = {
    shortcutKey: 'Slash',
    modifierKeys: ['Alt'],
    enabled: true,
    configuring: false
  }

  beforeEach(async () => {
    const keyboardShortcuts = await import('./keyboardShortcuts.ts')
    registerShortcut = keyboardShortcuts.registerShortcut
  })

  it('should unregister an existing shortcut', () => {
    registerShortcut(shortcut, () => {})

    expect(unregister).toHaveBeenCalledWith('Alt+/')
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('should register the new shortcut', () => {
    ;(register as Mock<typeof import('electron').globalShortcut.register>).mockImplementationOnce(
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

      expect(register).toHaveBeenCalledWith('Alt+/', expect.any(Function))
      expect(register).toHaveBeenCalledTimes(1)
    })
  })
})
