import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import log from 'electron-log'
import { fromUtf8 } from '@ethereumjs/util'
import * as helpersModule from './helpers'

// real functions under test, exercised with partial fixtures
const { decodeMessage, getRawTx, getSignedAddress } = helpersModule as Record<string, any>

beforeAll(async () => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

describe('#getRawTx', () => {
  ;[
    ['valid value', { value: '0x2540be400' }, 'value', '0x2540be400'],
    ['leading-zero value', { value: '0x0a45c6' }, 'value', '0xa45c6'],
    ['hex zero', { value: '0x0' }, 'value', '0x0'],
    ['empty hex value', { value: '0x' }, 'value', '0x0'],
    ['unprefixed zero', { value: '0' }, 'value', '0x0'],
    ['missing value', { value: undefined }, 'value', '0x0'],
    ['hex nonce', { nonce: '0x168' }, 'nonce', '0x168'],
    ['integer nonce', { nonce: '360' }, 'nonce', '0x168'],
    ['missing nonce', { nonce: undefined }, 'nonce', undefined]
  ].forEach(([description, input, field, expected]) => {
    it(`normalizes ${description}`, () => expect(getRawTx(input as any)[field as string]).toBe(expected))
  })
  ;['invalid', '-360', '3.60'].forEach((nonce) => {
    it(`rejects invalid nonce ${nonce}`, () => {
      expect(() => getRawTx({ nonce })).toThrow('Invalid nonce')
    })
  })
})

describe('#decodeMessage', () => {
  it('decodes UTF-8 hex messages', () => {
    expect(decodeMessage('0x68656c6c6f')).toBe('hello')
  })

  it('leaves invalid UTF-8 hex messages encoded', () => {
    expect(decodeMessage('0xc328')).toBe('0xc328')
  })
})

describe('#getSignedAddress', () => {
  it('returns a verified address for a valid signature', () => {
    const signature =
      '0xa4ba512820eab7022d0c88b9335425b6235c184565c84fb9e451965844a185030baec17ac9565c666675525cae41e367c458c1fdf575a80f6a44197d3b48c0ba1c'
    const message = fromUtf8('Example `personal_sign` message')

    getSignedAddress(signature, message, (err: any, verifiedAddress: any) => {
      expect(err).toBeFalsy()
      expect(verifiedAddress.toLowerCase()).toBe('0x3a077715f7383ad97215d1a585778bce6a9aa8af')
    })
  })

  it('returns an error if no signature is provided', () => {
    getSignedAddress(null, 'some message', (err: any) => {
      expect(err).toBeTruthy()
    })
  })
})
