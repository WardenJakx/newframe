import { beforeEach, expect, it } from 'bun:test'

import { screen, render } from '../../../../../../test/support/componentSetup'
import SignatureRequestComponent from './SignatureRequest'

let req: any

beforeEach(() => {
  req = {
    type: 'sign',
    data: {}
  }
})

it('displays a message to sign', () => {
  req.data.decodedMessage = 'hello, world!'

  render(<SignatureRequestComponent req={req} />)
  expect(screen.getByText('hello, world!')).toBeTruthy()
})

it('preserves canonical message line breaks', () => {
  req.data.decodedMessage = 'Definitive Flash v1 — Cancel Order\nOrder: 7c2fec66-26cb-4455-844a-f638f3cb8680'

  render(<SignatureRequestComponent req={req} />)

  const message = screen.getByLabelText('Message to sign')
  expect(message.tagName).toBe('PRE')
  expect(message.textContent).toBe(req.data.decodedMessage)
})
