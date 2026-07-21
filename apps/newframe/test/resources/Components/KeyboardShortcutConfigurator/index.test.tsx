import { beforeEach, describe, expect, it, mock } from 'bun:test'

import type { Mock } from 'bun:test'
import { render, screen } from '../../../componentSetup'

let KeyboardShortcutConfigurator: any
let mockLayoutGetKey: Mock<any>
const setShortcut = mock()

beforeEach(async () => {
  setShortcut.mockReset()
  mockLayoutGetKey = mock()
  ;(global.navigator as any).keyboard = {}
  global.navigator.keyboard.getLayoutMap = mock().mockResolvedValue({
    get: mockLayoutGetKey
  })
  KeyboardShortcutConfigurator = (
    await import('../../../../resources/Components/KeyboardShortcutConfigurator')
  ).default
  mockLayoutGetKey.mockImplementation((key: any) => {
    const keyMap: any = {
      Slash: '/'
    }
    return keyMap[key] || key
  })
})

it('should render an existing shortcut', () => {
  render(
    <KeyboardShortcutConfigurator
      actionText='Test this component'
      platform='linux'
      shortcutName='Test'
      shortcut={{
        modifierKeys: ['Alt'],
        shortcutKey: 'Slash',
        enabled: true,
        configuring: false
      }}
    />
  )

  const displayedShortcut = screen.getByLabelText('To Test this component press')
  expect(displayedShortcut.textContent).toBe('Alt + /')
})

it('should render an existing Meta key shortcut on MacOS', () => {
  render(
    <KeyboardShortcutConfigurator
      actionText='Test this component'
      platform='darwin'
      shortcutName='Test'
      shortcut={{
        modifierKeys: ['Meta'],
        shortcutKey: 'Slash',
        enabled: true,
        configuring: false
      }}
    />
  )

  const displayedShortcut = screen.getByLabelText('To Test this component press')
  expect(displayedShortcut.textContent).toBe('Command + /')
})

it('should render an existing Alt key shortcut on MacOS', () => {
  render(
    <KeyboardShortcutConfigurator
      actionText='Test this component'
      platform='darwin'
      shortcutName='Test'
      shortcut={{
        modifierKeys: ['Alt'],
        shortcutKey: 'Slash',
        enabled: true
      }}
    />
  )

  const displayedShortcut = screen.getByLabelText('To Test this component press')
  expect(displayedShortcut.textContent).toBe('Option + /')
})

it('should render an existing Meta key shortcut on Windows', () => {
  render(
    <KeyboardShortcutConfigurator
      actionText='Test this component'
      platform='win32'
      shortcutName='Test'
      shortcut={{
        modifierKeys: ['Meta'],
        shortcutKey: 'Slash',
        enabled: true,
        configuring: false
      }}
    />
  )

  const displayedShortcut = screen.getByLabelText('To Test this component press')
  expect(displayedShortcut.textContent).toBe('Win + /')
})

describe('when configuring', () => {
  it('should prompt to enter a shortcut', async () => {
    render(
      <KeyboardShortcutConfigurator
        actionText='Test this component'
        platform='linux'
        shortcutName='Test'
        shortcut={{
          modifierKeys: ['Meta'],
          shortcutKey: 'Slash',
          enabled: true,
          configuring: true
        }}
      />
    )

    const enterShortcutPrompt = screen.getByText('Enter new keyboard shortcut!')
    expect(enterShortcutPrompt).toBeDefined()
  })

  describe('and a valid shortcut is entered', () => {
    it('should set the new shortcut', async () => {
      const { user } = render(
        <KeyboardShortcutConfigurator
          actionText='Test this component'
          onChange={setShortcut}
          platform='linux'
          shortcutName='Test'
          shortcut={{
            modifierKeys: ['Meta'],
            shortcutKey: 'Slash',
            enabled: true,
            configuring: true
          }}
        />
      )

      const enterShortcutPrompt = screen.getByText('Enter new keyboard shortcut!')
      expect(enterShortcutPrompt).toBeDefined()
      await user.keyboard('{Alt>}T{/Alt}')

      expect(setShortcut).toHaveBeenLastCalledWith({
        enabled: true,
        configuring: false,
        modifierKeys: ['Alt'],
        shortcutKey: 'KeyT'
      })
    })

    it('should enable a new shortcut when the previous one was disabled', async () => {
      const { user } = render(
        <KeyboardShortcutConfigurator
          actionText='Test this component'
          onChange={setShortcut}
          platform='linux'
          shortcutName='Test'
          shortcut={{
            modifierKeys: ['Meta'],
            shortcutKey: 'Slash',
            enabled: false,
            configuring: true
          }}
        />
      )

      const enterShortcutPrompt = screen.getByText('Enter new keyboard shortcut!')
      expect(enterShortcutPrompt).toBeDefined()
      await user.keyboard('{Alt>}T{/Alt}')

      expect(setShortcut).toHaveBeenLastCalledWith({
        enabled: true,
        configuring: false,
        modifierKeys: ['Alt'],
        shortcutKey: 'KeyT'
      })
    })
  })

  describe('and an invalid shortcut is entered', () => {
    it('should not set a new shortcut', async () => {
      const { user } = render(
        <KeyboardShortcutConfigurator
          actionText='Test this component'
          onChange={setShortcut}
          platform='linux'
          shortcutName='Test'
          shortcut={{
            modifierKeys: ['Meta'],
            shortcutKey: 'Slash',
            enabled: true,
            configuring: true
          }}
        />
      )

      const enterShortcutPrompt = screen.getByText('Enter new keyboard shortcut!')
      expect(enterShortcutPrompt).toBeDefined()
      await user.keyboard('{Shift>};{/Shift}')

      expect(setShortcut).not.toHaveBeenCalled()
    })
  })
})
