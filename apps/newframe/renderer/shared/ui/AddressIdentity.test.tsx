import { afterEach, expect, it, jest as timers, mock } from 'bun:test'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { AddressIdentity, shortAddress } from './AddressIdentity'

const address = '0x1234567890abcdef'

afterEach(() => timers.useRealTimers())

it('shows a checkmark for one second after copying, then restores the copy button', () => {
  timers.useFakeTimers()
  const onCopy = mock(() => undefined)

  render(<AddressIdentity address={address} nickname='testname' onCopy={onCopy} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy address for testname' }))

  expect(onCopy).toHaveBeenCalledTimes(1)
  expect(onCopy).toHaveBeenCalledWith(address)
  expect(screen.getByRole('button', { name: 'Address copied for testname' })).toBeTruthy()

  act(() => timers.advanceTimersByTime(1000))

  expect(screen.getByRole('button', { name: 'Copy address for testname' })).toBeTruthy()
})

it('shows a nickname by default and the shortened address on hover', () => {
  render(<AddressIdentity address={address} nickname='testname' />)

  expect(screen.getByText('testname')).toBeTruthy()
  expect(screen.getByText(shortAddress(address))).toBeTruthy()
})

it('uses the full address for both the fallback display and nickname hover when requested', () => {
  const { rerender } = render(<AddressIdentity address={address} showFullAddress />)

  expect(screen.getByText(address)).toBeTruthy()

  rerender(<AddressIdentity address={address} nickname='testname' showFullAddress />)

  expect(screen.getByText('testname')).toBeTruthy()
  expect(screen.getByText(address)).toBeTruthy()
})
