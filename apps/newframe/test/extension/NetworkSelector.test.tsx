import { describe, expect, it, mock } from 'bun:test'

import { NetworkSelector } from '../../../newframe-extension/src/settings/NetworkSelector'
import { fireEvent, render, screen } from '../support/componentSetup'

describe('NetworkSelector', () => {
  it('shows the selected network and prevents unavailable networks from activating', () => {
    const onSelect = mock(() => undefined)

    render(
      <NetworkSelector
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

    expect(ethereum.getAttribute('aria-selected')).toBe('true')
    expect((optimism as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(ethereum)
    fireEvent.click(optimism)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('filters networks by name', () => {
    render(
      <NetworkSelector
        label='Network'
        onSelect={() => undefined}
        options={[
          { id: '1', label: 'Ethereum', selected: false },
          { id: '10', label: 'Optimism', selected: false }
        ]}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search network' }), {
      target: { value: 'opt' }
    })

    expect(screen.queryByRole('button', { name: 'Ethereum' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Optimism' })).toBeTruthy()
  })
})
