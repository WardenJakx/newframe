import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChoiceGrid } from '../src/control/ChoiceGrid'

describe('ChoiceGrid', () => {
  it('announces selection and prevents unavailable options from activating', async () => {
    const onSelect = mock(() => undefined)
    const user = userEvent.setup()

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

    await user.click(ethereum)
    await user.click(optimism)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('1')
  })
})
