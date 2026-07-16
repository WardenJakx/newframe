import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  SettingsConnectionAction,
  SettingsDisclosure,
  SettingsSelectionGrid
} from '../src/settings-panel/SettingsPanel'

describe('SettingsConnectionAction', () => {
  it('uses native disabled behavior when its action is unavailable', async () => {
    const onPress = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <SettingsConnectionAction
        disabled
        imageSource='/status.png'
        label='Service disconnected'
        onPress={onPress}
        tone='danger'
      />
    )

    const action = screen.getByRole('button', { name: 'Service disconnected' })
    expect((action as HTMLButtonElement).disabled).toBe(true)
    await user.click(action)
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('SettingsDisclosure', () => {
  it('exposes expanded state and remains keyboard operable', async () => {
    const onPress = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <SettingsDisclosure
        description='Network and connection'
        expanded={false}
        onPress={onPress}
        title='Ethereum'
      />
    )

    const disclosure = screen.getByRole('button', { name: /Ethereum/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    disclosure.focus()
    await user.keyboard('{Enter}')
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('SettingsSelectionGrid', () => {
  it('announces selection and prevents unavailable options from activating', async () => {
    const onSelect = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <SettingsSelectionGrid
        label='Network'
        onSelect={onSelect}
        options={[
          { id: '1', label: 'Ethereum', selected: true },
          { disabled: true, id: '10', label: 'Optimism', selected: false }
        ]}
      />
    )

    const ethereum = screen.getByRole('button', { name: 'Ethereum' })
    const optimism = screen.getByRole('button', { name: 'Optimism' })

    expect(ethereum.getAttribute('aria-pressed')).toBe('true')
    expect((optimism as HTMLButtonElement).disabled).toBe(true)

    await user.click(ethereum)
    await user.click(optimism)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('1')
  })
})
