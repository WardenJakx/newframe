import { afterEach, beforeEach, expect, it, jest as timers } from 'bun:test'

import { render, screen, act } from '../../../../../test/support/componentSetup'
import useCountdown from './useCountdown'

const startDate = new Date('2023-01-01')
const nextDay = new Date('2023-01-02')

type TestComponentProps = {
  end: string | number | Date
}

const TestComponent = ({ end }: TestComponentProps) => {
  const ttl = useCountdown(end)

  return <div role='timer'>{ttl}</div>
}

beforeEach(() => {
  timers.useFakeTimers({ now: startDate })
})

afterEach(() => {
  timers.useRealTimers()
})

it('updates the countdown time after a second', () => {
  render(<TestComponent end={nextDay.getTime()} />)

  act(() => {
    timers.advanceTimersByTime(1_000)
  })

  expect(screen.getByRole('timer').textContent).toBe('23h 59m 59s')
})

it.each([
  [1_000, '1s'],
  [60_000, '1m'],
  [3_600_000, '1h']
])('formats a single countdown unit', (offset, expected) => {
  render(<TestComponent end={startDate.getTime() + offset} />)
  expect(screen.getByRole('timer').textContent).toBe(expected)
})

it('sets the value correctly when the countdown has been completed', () => {
  render(<TestComponent end={nextDay.getTime()} />)

  act(() => {
    timers.advanceTimersByTime(1_000 * 60 * 60 * 24)
  })

  expect(screen.getByRole('timer').textContent).toBe('EXPIRED')
})

it('sets the value to the completed state when a past date in passed in', () => {
  render(<TestComponent end={startDate.getDate() - 1} />)
  expect(screen.getByRole('timer').textContent).toBe('EXPIRED')
})

it('reports invalid dates', () => {
  render(<TestComponent end='bogus' />)
  expect(screen.getByRole('timer').textContent).toBe('INVALID DATE')
})
