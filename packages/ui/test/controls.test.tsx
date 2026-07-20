import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '../src/primitives/Button'
import { Field } from '../src/primitives/Field'
import { IconButton } from '../src/primitives/IconButton'
import { Input } from '../src/primitives/Input'
import { Select } from '../src/primitives/Select'
import { Tabs } from '../src/primitives/Tabs'
import { Text } from '../src/primitives/Text'
import { ToggleButton } from '../src/primitives/ToggleButton'

describe('Side Panel controls', () => {
  it('keeps actions keyboard operable and honors native disabled behavior', async () => {
    const onPress = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <Button appearance='primary' disabled onPress={onPress}>
        <Text>Review</Text>
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Review' })
    button.focus()
    await user.keyboard('{Enter}')

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('builds constrained icon and toggle controls from the shared button behavior', async () => {
    const onIconPress = mock(() => undefined)
    const onTogglePress = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <>
        <IconButton expanded icon='menu' label='Main menu' onPress={onIconPress} />
        <ToggleButton onPress={onTogglePress} pressed>
          <Text>Selected mode</Text>
        </ToggleButton>
      </>
    )

    const iconButton = screen.getByRole('button', { name: 'Main menu' })
    const toggleButton = screen.getByRole('button', { name: 'Selected mode' })

    expect(iconButton.getAttribute('aria-expanded')).toBe('true')
    expect(iconButton.getAttribute('aria-haspopup')).toBe('dialog')
    expect(toggleButton.getAttribute('aria-pressed')).toBe('true')

    await user.click(iconButton)
    await user.click(toggleButton)
    expect(onIconPress).toHaveBeenCalledTimes(1)
    expect(onTogglePress).toHaveBeenCalledTimes(1)
  })

  it('renders constrained semantic text elements from one typography primitive', () => {
    const { container } = render(
      <>
        <Text as='strong' variant='supporting'>
          Important
        </Text>
        <Text as='output' variant='numeric'>
          42
        </Text>
        <Text as='small' variant='caption'>
          Supporting detail
        </Text>
      </>
    )

    expect(container.querySelector('strong')?.textContent).toBe('Important')
    expect(container.querySelector('output')?.textContent).toBe('42')
    expect(container.querySelector('small')?.textContent).toBe('Supporting detail')
  })

  it('preserves field labeling, invalid state, and approved select options', async () => {
    const user = userEvent.setup()

    render(
      <>
        <Field invalid label='Limit price'>
          <Input invalid required />
        </Field>
        <Select
          label='Time in force'
          defaultValue='gtc'
          options={[
            { label: 'Good till cancelled', value: 'gtc' },
            { label: 'Good till time', value: 'gtt' }
          ]}
        />
      </>
    )

    const input = screen.getByRole('textbox', { name: 'Limit price' })
    const select = screen.getByRole('combobox', { name: 'Time in force' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-required')).toBe('true')
    expect((input as HTMLInputElement).required).toBe(true)

    await user.selectOptions(select, 'gtt')
    expect((select as HTMLSelectElement).value).toBe('gtt')
  })

  it('exposes tabs as a reusable accessible selection control', async () => {
    const onSelect = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <Tabs
        label='Order type'
        items={[
          { active: true, id: 'market', label: 'Market' },
          { active: false, id: 'limit', label: 'Limit' }
        ]}
        onSelect={onSelect}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'Limit' }))
    expect(onSelect).toHaveBeenCalledWith('limit')
  })
})
