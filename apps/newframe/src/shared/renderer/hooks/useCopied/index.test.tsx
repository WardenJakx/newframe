import { afterEach, beforeEach, expect, it, jest as timers } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import {
  createRequestRendererCapabilitiesFake as createRequestPortsFake,
  type RequestRendererCapabilitiesFake
} from '../../../../features/requests/renderer/requestCapabilities.test-support'

let capabilities: RequestRendererCapabilitiesFake
let useCopiedMessage: typeof import('../../../../features/requests/renderer/hooks/useCopiedMessage').default

const TestComponent = () => {
  const [showCopiedMessage, copyText] = useCopiedMessage(capabilities.external, 'use frame!')

  return (
    <>
      <button onClick={copyText}>Copy</button>
      <div data-testid='iscopied'>{showCopiedMessage ? 'message copied!' : 'waiting for click'}</div>
    </>
  )
}

beforeEach(async () => {
  timers.useFakeTimers()
  capabilities = createRequestPortsFake()
  useCopiedMessage = (await import('../../../../features/requests/renderer/hooks/useCopiedMessage')).default
})

afterEach(() => {
  timers.useRealTimers()
})

it('starts hidden and becomes visible after copying', async () => {
  const { user } = render(<TestComponent />, { advanceTimersAfterInput: 0 })

  expect(screen.getByTestId('iscopied').textContent).toBe('waiting for click')
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

  expect(capabilities.external.copy).toHaveBeenCalledWith({ text: 'use frame!' })
})
