import { afterEach, beforeEach, expect, it, jest as timers } from 'bun:test'

import { render, screen } from '../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../test/support/rendererClient'

const link = createHostFixture()
let useCopiedMessage: typeof import('../useCopiedMessage').default

const TestComponent = () => {
  const [showCopiedMessage, copyText] = useCopiedMessage('use frame!')

  return (
    <>
      <button onClick={copyText}>Copy</button>
      <div data-testid='iscopied'>{showCopiedMessage ? 'message copied!' : 'waiting for click'}</div>
    </>
  )
}

beforeEach(async () => {
  timers.useFakeTimers()
  useCopiedMessage = (await import('../useCopiedMessage')).default
})

afterEach(() => {
  timers.useRealTimers()
})

it('should not display the copied text by default', () => {
  render(<TestComponent />)

  expect(screen.getByTestId('iscopied').textContent).toBe('waiting for click')
})

it('should let the component know to display the copied text after the copy function is invoked', async () => {
  const { user } = render(<TestComponent />, { advanceTimersAfterInput: 0 })

  const clickToCopyButton = screen.getByRole('button')
  await user.click(clickToCopyButton)

  expect(screen.getByTestId('iscopied').textContent).toBe('message copied!')
})

it('should reset the copied text after one second', async () => {
  const { user } = render(<TestComponent />, { advanceTimersAfterInput: true })

  const clickToCopyButton = screen.getByRole('button')
  await user.click(clickToCopyButton)

  expect(screen.getByTestId('iscopied').textContent).toBe('waiting for click')
})

it('send the copied data to the clipboard', async () => {
  const { user } = render(<TestComponent />, { advanceTimersAfterInput: 0 })

  const clickToCopyButton = screen.getByRole('button')
  await user.click(clickToCopyButton)

  expect(link.executeCommand).toHaveBeenCalledTimes(1)
  expect(link.executeCommand).toHaveBeenCalledWith({ type: 'clipboard.write', text: 'use frame!' })
})
