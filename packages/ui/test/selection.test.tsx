import { describe, expect, it, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Selection } from '../src/primitives/Selection'
import { Text } from '../src/primitives/Text'

describe('Selection', () => {
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
