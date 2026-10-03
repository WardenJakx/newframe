import { describe, expect, it } from 'bun:test'

import { inspectSiweMessage } from './siwe'

const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

function message(authority = 'example.com') {
  return `${authority} wants you to sign in with your Ethereum account:
${address}

Sign in to Example.

URI: https://example.com/login
Version: 1
Chain ID: 1
Nonce: 32891756
Issued At: 2021-09-30T16:25:24Z`
}

function review(authority: string, origin?: string) {
  const result = inspectSiweMessage(message(authority), origin)
  expect(result.kind).toBe('siwe')
  if (result.kind !== 'siwe') {
    throw new Error('Expected a SIWE message')
  }
  return result
}

describe('SIWE wallet message inspection', () => {
  it('keeps ordinary personal_sign messages and warns about malformed sign-in text anywhere', () => {
    expect(inspectSiweMessage('Approve this message.')).toEqual({ kind: 'message' })
    const malformed = inspectSiweMessage('Prefix wants you to sign in with your Ethereum account suffix')
    expect(malformed.kind).toBe('invalid')
    if (malformed.kind === 'invalid') {
      expect(malformed.warning).toContain('invalid format')
    }
  })

  it('parses all required and optional fields without reconstructing the original message', () => {
    const raw = `${message('https://example.com')}
Expiration Time: 2021-10-01T16:25:24Z
Not Before: 2021-09-30T16:25:24Z
Request ID: sign-in%2F123
Resources:
- ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/
- https://example.com/claim.json`
    const result = inspectSiweMessage(raw, 'https://example.com')
    expect(result).toMatchObject({
      kind: 'siwe',
      parsed: {
        scheme: 'https',
        domain: 'example.com',
        address,
        statement: 'Sign in to Example.',
        uri: 'https://example.com/login',
        version: '1',
        chainId: 1,
        nonce: '32891756',
        issuedAt: '2021-09-30T16:25:24Z',
        expirationTime: '2021-10-01T16:25:24Z',
        notBefore: '2021-09-30T16:25:24Z',
        requestId: 'sign-in%2F123',
        resources: [
          'ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/',
          'https://example.com/claim.json'
        ]
      },
      warnings: []
    })
    expect('blockedReason' in result).toBe(false)
  })

  it.each([
    ['prefixed text', `prefix\n${message()}`],
    ['suffixed text', `${message()}\nextra`],
    ['CRLF lines', message().replaceAll('\n', '\r\n')],
    ['short nonce', message().replace('Nonce: 32891756', 'Nonce: 123')],
    ['non-alphanumeric nonce', message().replace('Nonce: 32891756', 'Nonce: 3289_756')],
    ['missing field', message().replace('Nonce: 32891756\n', '')],
    ['duplicate field', message().replace('Nonce: 32891756', 'Nonce: 32891756\nNonce: 12345678')],
    ['wrong field case', message().replace('URI: ', 'Uri: ')],
    ['wrong version', message().replace('Version: 1', 'Version: 2')],
    ['invalid timestamp', message().replace('2021-09-30T16:25:24Z', 'yesterday')]
  ])('warns and falls back to raw text for %s', (_name, raw) => {
    expect(inspectSiweMessage(raw, 'https://example.com')).toMatchObject({ kind: 'invalid' })
  })

  it.each([
    ['example.com', 'https://example.com'],
    ['example.com:443', 'https://example.com'],
    ['https://example.com', 'https://example.com:443'],
    ['https://EXAMPLE.com', 'https://example.com/'],
    ['HTTPS://example.com', 'https://example.com'],
    ['https://example.com:8443', 'https://example.com:8443']
  ])('accepts matching HTTPS authority %s and origin %s', (authority, origin) => {
    const result = review(authority, origin)
    expect(result.blockedReason).toBeUndefined()
    expect(result.warnings).toEqual([])
  })

  it.each([
    ['example.com', 'http://example.com', 'scheme'],
    ['https://example.com', 'http://example.com', 'scheme'],
    ['https://example.com', 'https://attacker.com', 'domain'],
    ['https://example.com', 'https://sub.example.com', 'domain'],
    ['https://sub.example.com', 'https://example.com', 'domain'],
    ['https://example.com:8443', 'https://example.com', 'port'],
    ['https://example.com', 'https://example.com:8443', 'port'],
    ['https://example.com:8443', 'https://example.com:9443', 'port']
  ])('blocks mismatched %s against %s', (authority, origin, mismatch) => {
    expect(review(authority, origin).blockedReason).toContain(`sign-in ${mismatch}`)
  })

  it.each(['http://example.com', 'ftp://example.com', 'file://example.com', 'wss://example.com'])(
    'blocks unsupported scheme %s',
    (authority) => {
      expect(review(authority, 'https://example.com').blockedReason).toContain('unsupported scheme')
    }
  )

  it.each([undefined, '', 'example.com', '//example.com', 'null', 'https:///example.com'])(
    'blocks unavailable or non-absolute origin %s',
    (origin) => {
      expect(review('example.com', origin).blockedReason).toContain('origin could not be verified')
    }
  )

  it.each([
    'https://user@example.com',
    'https://@example.com',
    'https://example.com/login',
    'https://example.com/.',
    'https://example.com?',
    'https://example.com#',
    'https://example.com\\',
    ' https://example.com',
    'https://example.com\n',
    'https://example.com:65536'
  ])('rejects an origin containing credentials, URL content, or normalization traps: %s', (origin) => {
    expect(review('example.com', origin).blockedReason).toContain('origin could not be verified')
  })

  it.each(['user@example.com', '@example.com', 'example.com:65536'])(
    'blocks an unsafe sign-in authority %s even when the hostname would match',
    (authority) => {
      expect(review(authority, 'https://example.com').blockedReason).toContain('not a valid origin')
    }
  )

  it.each(['localhost', '127.0.0.1', '127.10.20.30', '[::1]'])(
    'permits explicit matching HTTP for loopback %s with a warning',
    (host) => {
      const result = review(`http://${host}:3000`, `http://${host}:3000`)
      expect(result.blockedReason).toBeUndefined()
      expect(result.warnings).toEqual(['This local development sign-in uses HTTP instead of HTTPS.'])
    }
  )

  it.each(['localhost.evil.com', '127.0.0.1.evil.com', '128.0.0.1', '[::2]', '192.168.0.1'])(
    'does not enable HTTP developer mode for non-loopback %s',
    (host) => {
      expect(review(`http://${host}`, `http://${host}`).blockedReason).toContain('unsupported scheme')
    }
  )

  it('keeps scheme, host, and port checks in local developer mode', () => {
    expect(review('localhost:3000', 'http://localhost:3000').blockedReason).toContain('scheme')
    expect(review('http://localhost:3000', 'http://127.0.0.1:3000').blockedReason).toContain('domain')
    expect(review('http://localhost:3000', 'http://localhost:4000').blockedReason).toContain('port')
    expect(review('ftp://localhost', 'http://localhost').blockedReason).toContain('unsupported scheme')
  })

  it('blocks a signing account mismatch and compares addresses without case sensitivity', () => {
    const mismatched = inspectSiweMessage(message(), 'https://example.com', {
      signingAddress: '0x1111111111111111111111111111111111111111'
    })
    expect(mismatched.kind).toBe('siwe')
    if (mismatched.kind === 'siwe') {
      expect(mismatched.blockedReason).toContain('signing account')
    }
    const matching = inspectSiweMessage(message(), 'https://example.com', {
      signingAddress: address.toLowerCase()
    })
    expect('blockedReason' in matching).toBe(false)
  })

  it.each([address.toLowerCase(), '0xC02aAA39b223FE8D0A0e5C4F27eAD9083C756Cc2'])(
    'reviews a known contract address %s without imposing an EOA checksum',
    (contractAddress) => {
      const raw = message().replace(address, contractAddress)
      const options = { isContractAccount: true, signingAddress: contractAddress }
      const accepted = inspectSiweMessage(raw, 'https://example.com', options)
      expect(accepted).toMatchObject({ kind: 'siwe', parsed: { address: contractAddress } })
      expect('blockedReason' in accepted).toBe(false)
      const rejected = inspectSiweMessage(raw, 'https://attacker.com', options)
      expect(rejected.kind).toBe('siwe')
      if (rejected.kind === 'siwe') {
        expect(rejected.blockedReason).toContain('domain does not match')
      }
      expect(inspectSiweMessage(raw, 'https://example.com').kind).toBe('invalid')
    }
  )

  it('still checks the full message grammar for known contracts', () => {
    const raw = `${message().replace(address, address.toLowerCase())}\nextra`
    expect(inspectSiweMessage(raw, 'https://example.com', { isContractAccount: true }).kind).toBe('invalid')
  })
})
