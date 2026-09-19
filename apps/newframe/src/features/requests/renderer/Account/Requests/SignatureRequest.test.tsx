import { expect, it } from 'bun:test'

import { screen, render } from '../../../../../../test/support/componentSetup'
import type { SignRequestView } from './requestViewTypes'
import SignatureRequestComponent from './SignatureRequest'

const address = '0x0000000000000000000000000000000000000001'
const statement = 'Sign in to manage your account.'
const signIn = `example.test wants you to sign in with your Ethereum account:
${address}

${statement}

URI: https://example.test/login
Version: 1
Chain ID: 1
Nonce: abcdefgh
Issued At: 2026-09-13T12:00:00Z`

function request(decodedMessage: string): SignRequestView {
  return {
    account: address,
    data: { decodedMessage },
    handlerId: 'request-1',
    origin: 'origin-1',
    payload: {
      id: 1,
      jsonrpc: '2.0',
      method: 'personal_sign',
      _origin: 'origin-1',
      params: [decodedMessage]
    },
    type: 'sign'
  }
}

it('shows the requester and preserves canonical non-SIWE message line breaks', () => {
  const decodedMessage = 'Definitive Flash v1 — Cancel Order\nOrder: 7c2fec66-26cb-4455-844a-f638f3cb8680'
  render(<SignatureRequestComponent req={request(decodedMessage)} originName='example.test' />)
  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('wants you to sign a message')).toBeTruthy()
  const message = screen.getByLabelText('Message to sign')
  expect(message.tagName).toBe('PRE')
  expect(message.textContent).toBe(decodedMessage)
  expect(screen.queryByText('wants you to sign in')).toBeNull()
})

it('presents parsed identity, statement and resources with complete details and unchanged raw message', async () => {
  const decodedMessage = `https://${signIn}
Expiration Time: 2026-09-14T12:00:00Z
Not Before: 2026-09-13T12:00:00Z
Request ID: request-123
Resources:
- https://example.test/terms
- ipfs://bafyexample`
  const { user } = render(
    <SignatureRequestComponent req={request(decodedMessage)} originName='example.test' />
  )
  expect(screen.getByText('wants you to sign in')).toBeTruthy()
  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText('https://example.test')).toBeTruthy()
  expect(screen.getByText(address)).toBeTruthy()
  expect(screen.getByText(statement)).toBeTruthy()
  expect(screen.getByText('https://example.test/terms')).toBeTruthy()
  expect(screen.getByText('ipfs://bafyexample')).toBeTruthy()
  expect(screen.queryByText(/does not match|differs from/)).toBeNull()
  const details = screen.getByText('Sign-in details').closest('details')
  expect(details?.open).toBe(false)
  await user.click(screen.getByText('Sign-in details'))
  expect(details?.open).toBe(true)
  expect(screen.getByText('request-123')).toBeTruthy()
  expect(screen.getByText('https://example.test/login')).toBeTruthy()
  expect(screen.getByText('2026-09-14T12:00:00Z')).toBeTruthy()
  const raw = screen.getByLabelText('Message to sign')
  expect(raw.closest('details')?.open).toBe(false)
  await user.click(screen.getByText('Raw message'))
  expect(raw.closest('details')?.open).toBe(true)
  expect(raw.textContent).toBe(decodedMessage)
})

it('keeps malformed SIWE-looking text intact and warns instead of presenting sign-in identity', () => {
  const decodedMessage = `${signIn}\nUnrecognized authorization: move all assets`
  render(<SignatureRequestComponent req={request(decodedMessage)} originName='example.test' />)
  expect(screen.getByLabelText('Message to sign').textContent).toBe(decodedMessage)
  expect(screen.getByText(/invalid format/)).toBeTruthy()
  expect(screen.queryByText('wants you to sign in')).toBeNull()
})

it('distinguishes requester and signing account from mismatching signed identity', () => {
  render(
    <SignatureRequestComponent
      req={request(signIn)}
      originName='other.test'
      signingAddress='0x0000000000000000000000000000000000000002'
    />
  )
  expect(screen.getByText('other.test')).toBeTruthy()
  expect(screen.getByText('example.test')).toBeTruthy()
  expect(screen.getByText(address)).toBeTruthy()
  expect(screen.getByText(/does not match the requesting site/)).toBeTruthy()
  expect(screen.getByText(/differs from the signing account/)).toBeTruthy()
})
