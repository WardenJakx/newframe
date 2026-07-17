import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '../src/control/Button'
import { Input } from '../src/control/Input'
import { Select } from '../src/control/Select'
import { Field } from '../src/side-panel/Field'
import { Tabs } from '../src/side-panel/Tabs'
import { Text } from '../src/typography/Text'

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
