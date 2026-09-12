import { expect, it } from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { signerFixture, transaction, vectors } from '../../../../../test/integration/fixtures/airgap.js'
import type { TypedMessage } from '../../../../features/requests/contract/requests.js'

it('requires the approved payload and a valid derivation index before any exchange', () => {
  const fixture = signerFixture()
  const { signer, owner, request } = fixture
  const message = '0x00ff80c3'
  request('sign', message)
  const errors: string[] = []
  const done: Callback<string> = (error) => errors.push(error!.message)
  signer.signMessage(0, message, done)
  signer.signMessage(-1, message, done, owner.context)
  signer.signMessage(100, message, done, owner.context)
  signer.signMessage(0, '0x00', done, owner.context)
  expect(errors).toHaveLength(4)
  expect(signer.summary().airgapRequest).toBeUndefined()
  fixture.dispose()
})

for (const vector of vectors.messages)
  it(`recovers ${vector.name} against exact approved data`, async () => {
    const fixture = signerFixture()
    const results: Array<{ error: Error | null | undefined; value?: string }> = []
    const done: Callback<string> = (error, value) => results.push({ error, value })
    if (vector.name.startsWith('personal')) {
      const message = `0x${vector.signData}`
      fixture.request('sign', message)
      fixture.signer.signMessage(0, message, done, fixture.owner.context)
    } else {
      const typedMessage: TypedMessage<SignTypedDataVersion.V4> = {
        data: JSON.parse(Buffer.from(vector.signData, 'hex').toString('utf8')),
        version: SignTypedDataVersion.V4
      }
      fixture.request('signTypedData', typedMessage)
      fixture.signer.signTypedData(0, typedMessage, done, fixture.owner.context)
    }
    expect(fixture.envelope().getSignData().toString('hex')).toBe(vector.signData)
    const reference = fixture.reference()
    const frames = fixture.frames(vector.signature)
    for (const frame of frames) await fixture.signer.scan(reference, fixture.owner.context.owner, frame)
    expect(results).toHaveLength(1)
    expect(results[0].error).toBeNull()
    expect(results[0].value?.slice(-2)).toBe('1c')
    fixture.dispose()
  })

it('rejects responses for another UUID or signing key without consuming the request', async () => {
  const fixture = signerFixture()
  const data = transaction()
  fixture.request('transaction', data)
  const results: unknown[] = []
  fixture.signer.signTransaction(
    0,
    data,
    (error, result) => results.push(error || result),
    fixture.owner.context
  )
  const reference = fixture.reference()
  const frame = fixture.frames(vectors.transactions[0].signature)[0]
  await expect(
    fixture.signer.scan(
      reference,
      fixture.owner.context.owner,
      fixture.frames(vectors.transactions[0].signature, '00000000-0000-4000-8000-000000000000')[0]
    )
  ).rejects.toThrow()
  const altered = '01'.repeat(32) + vectors.transactions[0].signature.slice(64)
  await expect(
    fixture.signer.scan(reference, fixture.owner.context.owner, fixture.frames(altered)[0])
  ).rejects.toThrow()
  expect(results).toEqual([])
  await fixture.signer.scan(reference, fixture.owner.context.owner, frame)
  expect(results).toEqual([`0x${vectors.transactions[0].signedHex}`])
  fixture.dispose()
})

for (const change of ['account', 'profile', 'lock', 'signer', 'remove-account'] as const)
  it(`cancels ${change} before response completion`, async () => {
    const fixture = signerFixture()
    const data = transaction()
    fixture.request('transaction', data)
    const results: unknown[] = []
    fixture.signer.signTransaction(
      0,
      data,
      (error, result) => results.push(error || result),
      fixture.owner.context
    )
    const reference = fixture.reference()
    if (change === 'account')
      fixture.store.setState((state) => {
        state.main.currentAccount = 'other'
      })
    else if (change === 'profile')
      fixture.store.setState((state) => {
        state.main.currentProfile = 'other'
      })
    else if (change === 'lock') fixture.store.getState().setAppLock({ locked: true, vaultExists: true })
    else if (change === 'signer') fixture.store.getState().removeSigner(fixture.signer.id)
    else if (change === 'remove-account')
      fixture.store.setState((state) => {
        delete state.main.accounts[fixture.address]
      })
    expect(fixture.signer.getRequest(reference, fixture.owner.context.owner)).toBeUndefined()
    expect(results).toHaveLength(1)
    expect(results[0]).toBeInstanceOf(Error)
    fixture.dispose()
  })

it('rejects unsupported transaction types, creation and typed-data versions before QR', () => {
  const fixture = signerFixture()
  const errors: unknown[] = []
  for (const raw of [
    { ...transaction(), type: '0x1' },
    { ...transaction(), type: '0x3' },
    { ...transaction(), to: undefined }
  ]) {
    fixture.request('transaction', raw)
    fixture.signer.signTransaction(0, raw, (error) => errors.push(error), fixture.owner.context)
  }
  const data = {
    version: SignTypedDataVersion.V3,
    data: JSON.parse(Buffer.from(vectors.messages[1].signData, 'hex').toString())
  } as TypedMessage
  fixture.request('signTypedData', data)
  fixture.signer.signTypedData(0, data, (error) => errors.push(error), fixture.owner.context)
  expect(errors).toHaveLength(4)
  expect(errors.every((error) => error instanceof Error)).toBe(true)
  expect(fixture.signer.summary().airgapRequest).toBeUndefined()
  fixture.dispose()
})
