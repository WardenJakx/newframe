import { describe, expect, it } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { MenuItem, MenuOverlay } from '../src/menu/Menu'

function MenuHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} type='button'>
        Open
      </button>
      {open ? (
        <MenuOverlay closeLabel='Close menu' label='Main menu' onClose={() => setOpen(false)} title='Menu'>
          <MenuItem icon='settings' label='Settings' onPress={() => undefined} />
        </MenuOverlay>
      ) : null}
    </>
  )
}

describe('MenuOverlay', () => {
  it('focuses its close action, dismisses on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)
    const trigger = screen.getByRole('button', { name: 'Open' })

    await user.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close menu' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Main menu' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders menu actions as native named buttons', async () => {
    const onPress = () => undefined
    render(<MenuItem icon='inbox' label='Requests' onPress={onPress} />)
    expect(screen.getByRole('button', { name: 'Requests' }).tagName).toBe('BUTTON')
  })
})
