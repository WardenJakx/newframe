import { afterEach, beforeEach, expect, it, jest as timers } from 'bun:test'

import Countdown from '../../../../resources/Components/Countdown'
import { render, screen } from '../../../componentSetup'

beforeEach(() => {
  timers.useFakeTimers()
})

afterEach(() => {
  timers.useRealTimers()
})

it('shows the time remaining until a valid date', () => {
  render(<Countdown end={new Date().getTime() + 86_400_000} />)

  expect(screen.getByRole('timer').textContent).toBe('24h')
})

it('shows that a date is invalid', () => {
  render(<Countdown end='bogus' />)

  expect(screen.getByRole('timer').textContent).toBe('INVALID DATE')
})
