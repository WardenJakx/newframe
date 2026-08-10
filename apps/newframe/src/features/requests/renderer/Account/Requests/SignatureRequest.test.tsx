import { expect, it } from 'bun:test'

import { screen, render } from '../../../../../../test/support/componentSetup'
import SignatureRequestComponent from './SignatureRequest'
import type { SignRequestView } from './requestViewTypes'

it('preserves canonical message line breaks', () => {
  const decodedMessage = 'Definitive Flash v1 — Cancel Order\nOrder: 7c2fec66-26cb-4455-844a-f638f3cb8680'
  const req: SignRequestView = {
    account: '0x0000000000000000000000000000000000000001',
    data: { decodedMessage },
    handlerId: 'request-1',
    origin: 'https://example.test',
    payload: {
      id: 1,
      jsonrpc: '2.0',
      method: 'personal_sign',
      _origin: 'https://example.test',
      params: [decodedMessage]
    },
    type: 'sign'
  }

  render(<SignatureRequestComponent req={req} />)

  const message = screen.getByLabelText('Message to sign')
  expect(message.tagName).toBe('PRE')
  expect(message.textContent).toBe(decodedMessage)
})
