import { expect, it } from 'bun:test'

import { requestOriginFromSender } from './requestOrigin'

it('uses the requesting frame origin rather than its parent tab', () => {
  const sender = {
    origin: 'https://iframe.example:8443',
    url: 'https://iframe.example:8443/sign-in',
    tab: { url: 'https://parent.example' }
  }
  expect(requestOriginFromSender(sender)).toBe('https://iframe.example:8443')
})

it('preserves a browser-reported opaque origin', () => {
  expect(requestOriginFromSender({ origin: 'null', url: 'https://iframe.example/sign-in' })).toBe('null')
})

it('uses the browser sender URL when origin metadata is unavailable', () => {
  expect(requestOriginFromSender({ url: 'http://localhost:3000/sign-in' })).toBe('http://localhost:3000')
  expect(requestOriginFromSender({ url: 'file:///wallet.html' })).toBe('null')
  expect(requestOriginFromSender({ url: 'invalid' })).toBe('')
})
