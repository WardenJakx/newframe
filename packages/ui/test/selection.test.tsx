import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Selection } from '../src/primitives/Selection'
import { Text } from '../src/primitives/Text'

describe('Selection', () => {
  it('matches the trigger by default and supports an explicitly aligned wide menu', () => {
    const selection = (
      menuAlign?: 'start' | 'center' | 'end',
      menuWidth?: 'trigger' | 'wide',
      triggerSize?: 'compact' | 'small' | 'medium'
    ) => (
      <Selection
        items={[{ content: <Text>Alpha</Text>, id: 'alpha' }]}
        label='Assets'
        menuAlign={menuAlign}
        menuWidth={menuWidth}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
        selectedId='alpha'
        trigger={<Text>Alpha</Text>}
        triggerSize={triggerSize}
      />
    )
    const { rerender } = render(selection())
    const menu = screen.getByRole('listbox').parentElement as HTMLDivElement

    expect(menu.classList.contains('w_100%')).toBe(true)
    expect(menu.classList.contains('inset-s_0')).toBe(true)

    rerender(selection('end', 'wide'))

    expect(menu.classList.contains('w_selection-menu')).toBe(true)
    expect(menu.classList.contains('inset-e_0')).toBe(true)

    rerender(selection('center', 'wide', 'small'))

    expect(menu.classList.contains('inset-s_50%')).toBe(true)
    expect(menu.classList.contains('trf_translateX(-50%)')).toBe(true)
    expect(menu.classList.contains('inset-bs_calc(token(sizes.button-small)_+_token(spacing.3))')).toBe(true)

    rerender(selection('end', 'wide', 'compact'))

    const compactTrigger = screen.getByRole('button', { name: 'Assets' })
    expect(compactTrigger.classList.contains('w_selection-trigger-compact')).toBe(true)
    expect(compactTrigger.classList.contains('h_button-compact')).toBe(true)
    expect(menu.classList.contains('inset-bs_calc(token(sizes.button-compact)_+_token(spacing.3))')).toBe(
      true
    )
  })

  it('owns listbox navigation and returns semantic values', async () => {
    const onOpenChange = mock(() => undefined)
    const onSelect = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <Selection
        items={[
          { content: <Text>Alpha</Text>, id: 'alpha' },
          { content: <Text>Beta</Text>, id: 'beta' }
        ]}
        label='Assets'
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        open
        selectedId='alpha'
        trigger={<Text>Alpha</Text>}
      />
    )

    screen.getByRole('button', { name: 'Assets' }).focus()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith('beta')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('prevents opening when every option is unavailable', async () => {
    const onOpenChange = mock(() => undefined)
    const user = userEvent.setup()

    render(
      <Selection
        items={[{ content: <Text>Unavailable</Text>, disabled: true, id: 'unavailable' }]}
        label='Assets'
        onOpenChange={onOpenChange}
        onSelect={() => undefined}
        open={false}
        trigger={<Text>Choose an asset</Text>}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Assets' })
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    await user.click(trigger)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
