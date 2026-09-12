import { describe, expect, it } from 'bun:test'

import { useState } from 'react'

import { fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import { MenuItem } from './Menu/MenuItem'
import { MenuOverlay } from './Menu/MenuOverlay'

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
  it('focuses its close action, dismisses on Escape, and restores trigger focus', () => {
    render(<MenuHarness />)
    const trigger = screen.getByRole('button', { name: 'Open' })

    // The browser focuses a clicked button; fireEvent intentionally does not emulate that default action.
    trigger.focus()
    fireEvent.click(trigger)
    // Focus ownership is the behavior under test, so inspect the DOM focus target directly.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close menu' }))

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Main menu' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Main menu' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders menu actions as native named buttons', async () => {
    const onPress = () => undefined
    render(<MenuItem icon='inbox' label='Requests' onPress={onPress} />)
    expect(screen.getByRole('button', { name: 'Requests' }).tagName).toBe('BUTTON')
  })
})
