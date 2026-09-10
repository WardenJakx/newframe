import { describe, expect, it } from 'bun:test'

import { openSecret, sealSecret } from './secret'

describe('hot signer secret envelope', () => {
  const vaultKey = 'ab'.repeat(32)

  it('round trips through fresh AES-GCM envelopes', () => {
    const secret = Buffer.from('local secret')
    const first = sealSecret(secret, vaultKey)
    const second = sealSecret(secret, vaultKey)

    expect(first).not.toEqual(second)
    expect(openSecret(first, vaultKey)).toEqual(secret)
    expect(openSecret(sealSecret(Buffer.alloc(0), vaultKey), vaultKey)).toEqual(Buffer.alloc(0))
  })

  it('rejects tampering and malformed vault keys', () => {
    const envelope = sealSecret(Buffer.from('local secret'), vaultKey)
    envelope.ciphertext = `${envelope.ciphertext[0] === '0' ? '1' : '0'}${envelope.ciphertext.slice(1)}`

    expect(() => openSecret(envelope, vaultKey)).toThrow()
    expect(() => sealSecret(Buffer.from('local secret'), 'abcd')).toThrow(
      'Vault key must be 32 bytes encoded as hex'
    )
  })
})
