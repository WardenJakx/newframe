import { useEffect } from 'react'
import hotkeys from 'hotkeys-js'

import type { Shortcut } from '../../../main/store/state/types/shortcuts'
import { getShortcutFromKeyEvent, getDisplayShortcut, isShortcutKey } from '../../keyboard'

interface KeyboardShortcutConfiguratorProps {
  actionText?: string
  platform: any
  shortcut: any
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
  const { modifierKeys, shortcutKey } = getDisplayShortcut(platform, shortcut)

  const EnterShortcut = () => {
    useEffect(() => {
      hotkeys('*', { capture: true } as any, (event: KeyboardEvent) => {
        event.preventDefault()

        const allowedModifierKeys = ['Meta', 'Alt', 'Control', 'Command']
        const isModifierKey = allowedModifierKeys.includes(event.key)

        // ignore modifier key solo keypresses and disabled keys
        if (!isModifierKey && isShortcutKey(event)) {
          const newShortcut = getShortcutFromKeyEvent(event, hotkeys.getPressedKeyCodes(), platform)
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
    }, [onChange, platform])

    const labelId = `shortcut-${shortcutName.toLowerCase()}-configure`
    return (
      <div style={{ display: 'flex' }}>
        <label id={labelId}>Enter new keyboard shortcut!</label>
        <div className='loaderWrap'>
          <div className='loader' />
        </div>
      </div>
    )
  }

  const DisplayShortcut = () => {
    const labelId = `shortcut-${shortcutName.toLowerCase()}-display`
    return (
      <>
        <label id={labelId}>To {actionText} press</label>

        <span className='keyCommand' aria-labelledby={labelId}>
          {[...modifierKeys, shortcutKey].map((displayKey, index, displayKeys) =>
            index === displayKeys.length - 1 ? (
              displayKey
            ) : (
              <span key={index}>
                {displayKey}
                <span style={{ padding: '0px 3px' }}>+</span>
              </span>
            )
          )}
        </span>
      </>
    )
  }

  return <span>{shortcut.configuring ? <EnterShortcut /> : <DisplayShortcut />}</span>
}

export default KeyboardShortcutConfigurator
