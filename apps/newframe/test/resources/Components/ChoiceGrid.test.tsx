import { describe, expect, it, mock } from 'bun:test'

import { ChoiceGrid } from '../../../../newframe-extension/src/settings/ChoiceGrid'
import { fireEvent, render, screen } from '../../componentSetup'

describe('ChoiceGrid', () => {
  it('announces selection and prevents unavailable options from activating', () => {
    const onSelect = mock(() => undefined)

    render(
      <ChoiceGrid
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

    fireEvent.click(ethereum)
    fireEvent.click(optimism)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('1')
  })
})
