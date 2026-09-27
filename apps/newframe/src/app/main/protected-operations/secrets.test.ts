import { expect, it } from 'bun:test'

import { exportProtectedPrivateKey } from './secrets'

it('exports only an account in the unlocked active profile', async () => {
  const account = { address: 'account', created: 'created', signer: 'signer', profileId: 'profile' }
  let locked = true
  let currentProfile = 'profile'
  let calls = 0
  const ports = {
    snapshot: () => ({ currentProfile, appLock: { locked }, accounts: { account } }),
    exportSecret: async () => {
      calls++
      return { type: 'privateKey', value: 'secret' }
    }
  }
  expect(exportProtectedPrivateKey('account', ports)).rejects.toThrow('Unlock')
  locked = false
  currentProfile = 'other'
  expect(exportProtectedPrivateKey('account', ports)).rejects.toThrow('active profile')
  expect(await exportProtectedPrivateKey('missing', ports)).toBeUndefined()
  expect(calls).toBe(0)
  currentProfile = 'profile'
  expect(await exportProtectedPrivateKey('account', ports)).toBe('secret')
  expect(calls).toBe(1)
})

it.each(['lock', 'profile', 'signer', 'account'] as const)(
  'discards an exported key when %s authority changes during decryption',
  async (change) => {
    const account = { address: 'account', created: 'created', signer: 'signer', profileId: 'profile' }
    const state = { currentProfile: 'profile', appLock: { locked: false }, accounts: { account } }
    let complete!: (value: { type: string; value: string }) => void
    const result = exportProtectedPrivateKey('account', {
      snapshot: () => state,
      exportSecret: () =>
        new Promise((resolve) => {
          complete = resolve
        })
    })
    const rejection = result.catch((error: unknown) => error)
    if (change === 'lock') {
      state.appLock.locked = true
    }
    if (change === 'profile') {
      state.currentProfile = 'other'
    }
    if (change === 'signer') {
      account.signer = 'replacement'
    }
    if (change === 'account') {
      account.created = 'replacement'
    }
    complete({ type: 'privateKey', value: 'secret' })
    expect(await rejection).toEqual(new Error('Account authority changed during private key export.'))
  }
)
