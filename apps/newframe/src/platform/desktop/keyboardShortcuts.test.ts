import { beforeEach, describe, expect, it } from 'bun:test'

import { electronMock } from '../../../test/support/electron.mock'

let registerShortcut: any
const { register, unregister } = electronMock.globalShortcut

describe('registerShortcut', () => {
  const shortcut = {
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
    register.mockImplementationOnce((accelerator: string, handlerFn: (accelerator: string) => void) =>
      handlerFn(accelerator)
    )

    return new Promise<void>((resolve) => {
      const handlerFn = (accelerator: any) => {
        expect(accelerator).toBe('Alt+/')
        resolve()
      }
      registerShortcut(shortcut, handlerFn)

      expect(register).toHaveBeenCalledWith('Alt+/', expect.any(Function))
      expect(register).toHaveBeenCalledTimes(1)
    })
  })
})
