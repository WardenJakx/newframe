import { beforeEach, describe, expect, it, type Mock } from 'bun:test'

import { electronMock } from '../../../test/support/electron.mock'
import type { Shortcut } from '../../features/settings/domain/state/shortcuts'

let registerShortcut: typeof import('./keyboardShortcuts').registerShortcut
const { register, unregister } = electronMock.globalShortcut

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
