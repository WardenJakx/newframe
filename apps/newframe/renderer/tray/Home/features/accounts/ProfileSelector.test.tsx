import { beforeEach, describe, expect, it } from 'bun:test'
import type { Mock } from 'bun:test'

import { cleanup, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { ProfileSelector } from './ProfileSelector'

const link = createHostFixture()
const profiles = [
  { id: 'personal', name: 'Personal', accountCount: 2, cachedValue: { state: 'missing' as const } },
  { id: 'work', name: 'Work', accountCount: 1, cachedValue: { state: 'unpriced' as const } },
  { id: 'empty', name: 'Empty', accountCount: 0, cachedValue: { state: 'priced' as const, value: 12.5 } }
]

describe('ProfileSelector', () => {
  beforeEach(() => {
    ;(link.executeCommand as Mock<any>).mockResolvedValue({ ok: true })
  })

  it('shows every ordered summary and supports listbox keyboard selection without a dormant query', async () => {
    const { user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)

    expect(link.executeQuery).not.toHaveBeenCalled()
    const trigger = screen.getByRole('button', { name: 'Select active profile' })
    await user.click(trigger)

    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('---')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('$12.50')).toBeTruthy()
    expect(screen.getByText('2 Accounts')).toBeTruthy()
    expect(screen.getByText('1 Account')).toBeTruthy()

    trigger.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(link.executeCommand).toHaveBeenCalledWith({ type: 'profile.select', profileId: 'work' })
  })

  it('queries movable accounts only after create opens and creates with selected moves', async () => {
    ;(link.executeQuery as Mock<any>).mockResolvedValueOnce({
      ok: true,
      accounts: [{ id: 'account-1', address: '0x1', name: 'Primary', profileId: 'personal' }]
    })
    ;(link.executeCommand as Mock<any>).mockResolvedValueOnce({ ok: true, profileId: 'new-profile' })

    const { user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    expect(link.executeQuery).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(link.executeQuery).toHaveBeenCalledWith({ type: 'profile.movable-accounts' })
    await user.type(screen.getByLabelText('New profile name'), '  Travel  ')
    await user.click(await screen.findByRole('button', { name: /Primary/ }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.create',
      name: 'Travel',
      accountIds: ['account-1']
    })
  })

  it('creates without moves, validates names, and keeps command failures visible', async () => {
    ;(link.executeQuery as Mock<any>).mockResolvedValueOnce({ ok: true, accounts: [] })
    ;(link.executeCommand as Mock<any>).mockResolvedValueOnce({ ok: false, error: 'duplicate_name' })

    const { user } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(screen.getByText('Enter a profile name between 1 and 50 characters.')).toBeTruthy()
    expect(link.executeCommand).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('New profile name'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(link.executeCommand).toHaveBeenCalledWith({ type: 'profile.create', name: 'Travel' })
    expect(await screen.findByText('A profile with that name already exists.')).toBeTruthy()
  })

  it('renames on Enter and enforces deletion constraints before confirmation', async () => {
    const { user } = render(<ProfileSelector currentProfile='empty' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText('Rename profile')
    await user.clear(input)
    await user.type(input, 'Archive{Enter}')
    expect(link.executeCommand).toHaveBeenCalledWith({
      type: 'profile.rename',
      profileId: 'empty',
      name: 'Archive'
    })

    cleanup()
    const { user: personalUser } = render(<ProfileSelector currentProfile='personal' profiles={profiles} />)
    await personalUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    const { user: onlyProfileUser } = render(
      <ProfileSelector currentProfile='empty' profiles={[profiles[2]]} />
    )
    await onlyProfileUser.click(screen.getByRole('button', { name: 'Select active profile' }))
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires deletion confirmation and leaves the projection responsible for removal', async () => {
    const { user } = render(<ProfileSelector currentProfile='empty' profiles={profiles} />)
    await user.click(screen.getByRole('button', { name: 'Select active profile' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(link.executeCommand).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(link.executeCommand).toHaveBeenCalledWith({ type: 'profile.delete', profileId: 'empty' })
    })
  })
})
