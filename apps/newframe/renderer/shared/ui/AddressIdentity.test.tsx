import { afterEach, expect, it, jest as timers, mock } from 'bun:test'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { AddressIdentity } from './AddressIdentity'

afterEach(() => timers.useRealTimers())

it('shows a checkmark for one second after copying, then restores the copy button', () => {
  timers.useFakeTimers()
  const onCopy = mock(() => undefined)

  render(<AddressIdentity address='0x1234567890abcdef' name='testname' onCopy={onCopy} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy address for testname' }))

  expect(onCopy).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Address copied for testname' })).toBeTruthy()

  act(() => timers.advanceTimersByTime(1000))

  expect(screen.getByRole('button', { name: 'Copy address for testname' })).toBeTruthy()
})
