import { useEffect } from 'react'
import hotkeys from 'hotkeys-js'

import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import type { Shortcut } from '../../../main/store/state/types/shortcuts'
import { getShortcutFromKeyEvent, getDisplayShortcut, isShortcutKey } from '../../keyboard'
import type { Platform } from '../../keyboard/mappings'

interface KeyboardShortcutConfiguratorProps {
  actionText?: string
  platform: Platform | string
  shortcut: Shortcut
  shortcutName: string
  onChange?: (shortcut: Shortcut) => void
}

const KeyboardShortcutConfigurator = ({
  actionText = '',
  onChange,
  platform,
  shortcut,
  shortcutName
}: KeyboardShortcutConfiguratorProps) => {
  const normalizedPlatform: Platform =
    platform === 'darwin' || platform === 'win32' || platform === 'linux' ? platform : 'linux'
  const { modifierKeys, shortcutKey } = getDisplayShortcut(normalizedPlatform, shortcut)

  useEffect(() => {
    if (!shortcut.configuring) return

    hotkeys('*', { capture: true } as any, (event: KeyboardEvent) => {
      event.preventDefault()

      const allowedModifierKeys = ['Meta', 'Alt', 'Control', 'Command']
      const isModifierKey = allowedModifierKeys.includes(event.key)

      // ignore modifier key solo keypresses and disabled keys
      if (!isModifierKey && isShortcutKey(event)) {
        const newShortcut = getShortcutFromKeyEvent(event, hotkeys.getPressedKeyCodes(), normalizedPlatform)
        // enable the new shortcut
        onChange?.({
          ...newShortcut,
          configuring: false,
          enabled: true
        } as Shortcut)
      }

      return false
    })

    return () => hotkeys.unbind()
  }, [normalizedPlatform, onChange, shortcut.configuring])

  if (shortcut.configuring) {
    return (
      <Stack align='center' direction='row' gap='xsmall'>
        <Text as='span' variant='supporting'>
          Enter new keyboard shortcut!
        </Text>
        <Spinner label={`Waiting for ${shortcutName} shortcut`} size='small' />
      </Stack>
    )
  }

  const display = [...modifierKeys, shortcutKey].join(' + ')
  return (
    <Stack align='center' direction='row' gap='xsmall' wrap>
      <Text as='span' tone='muted' variant='supporting'>
        To {actionText} press
      </Text>
      <Text as='span' label={`To ${actionText} press`} variant='code'>
        {display}
      </Text>
    </Stack>
  )
}

export default KeyboardShortcutConfigurator
