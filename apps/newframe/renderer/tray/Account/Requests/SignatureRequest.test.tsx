import { beforeEach, expect, it } from 'bun:test'

import { screen, render } from '../../../../test/support/componentSetup'
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
