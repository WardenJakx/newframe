import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PanelButton, PanelInput, PanelLabel, PanelSelect, PanelText } from '../src/side-panel/SidePanel'

describe('Side Panel controls', () => {
  it('keeps actions keyboard operable and honors native disabled behavior', async () => {
    const onPress = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <PanelButton disabled onClick={onPress} variants='tradePrimaryButton'>
        Review
      </PanelButton>
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
        <PanelLabel>
          <PanelText>Limit price</PanelText>
          <PanelInput aria-invalid='true' required />
        </PanelLabel>
        <PanelSelect
          aria-label='Time in force'
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
    expect((input as HTMLInputElement).required).toBe(true)

    await user.selectOptions(select, 'gtt')
    expect((select as HTMLSelectElement).value).toBe('gtt')
  })
})
