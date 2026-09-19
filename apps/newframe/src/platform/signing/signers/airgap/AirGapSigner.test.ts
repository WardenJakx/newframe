import { expect, it } from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { signerFixture, transaction, vectors } from '../../../../../test/integration/fixtures/airgap.js'
import { TypedDataV4Schema } from '../../../../app/contracts/operations.js'
import type { TypedMessage } from '../../../../features/requests/contract/requests.js'

function parseTypedData(value: string): TypedMessage<SignTypedDataVersion.V4>['data'] {
  return TypedDataV4Schema.parse(
    JSON.parse(value)
  ) as unknown as TypedMessage<SignTypedDataVersion.V4>['data']
}

it('requires an approving account context and valid derivation index before any exchange', () => {
  const fixture = signerFixture()
  const { signer, owner } = fixture
  const message = '0x00ff80c3'
  const errors: string[] = []
  const done: Callback<string> = (error) => errors.push(error!.message)
  signer.signMessage(0, message, done)
  signer.signMessage(-1, message, done, owner.context)
  signer.signMessage(100, message, done, owner.context)
  signer.signMessage(0, message, done, { ...owner.context, accountId: '0x' + '11'.repeat(20) })
  owner.abort()
  signer.signMessage(0, message, done, owner.context)
  expect(errors).toHaveLength(5)
  expect(signer.summary().airgapRequest).toBeUndefined()
  fixture.dispose()
})

for (const vector of vectors.messages) {
  it(`recovers ${vector.name} against exact approved data`, async () => {
    const fixture = signerFixture()
    const results: Array<{ error: Error | null | undefined; value?: string }> = []
    const done: Callback<string> = (error, value) => results.push({ error, value })
    if (vector.name.startsWith('personal')) {
      const message = `0x${vector.signData}`
      fixture.signer.signMessage(0, message, done, fixture.owner.context)
    } else {
      const typedMessage: TypedMessage<SignTypedDataVersion.V4> = {
        data: parseTypedData(Buffer.from(vector.signData, 'hex').toString('utf8')),
        version: SignTypedDataVersion.V4
      }
      fixture.signer.signTypedData(0, typedMessage, done, fixture.owner.context)
      // The exchange verifies the approved clone even if its caller later changes the object.
      typedMessage.data.domain = { chainId: 2 }
    }
    expect(fixture.envelope().getSignData().toString('hex')).toBe(vector.signData)
    const reference = fixture.reference()
    const frames = fixture.frames(vector.signature)
    for (const frame of frames) {
      await fixture.signer.scan(reference, fixture.owner.context.owner, frame)
    }
    expect(results).toHaveLength(1)
    expect(results[0].error).toBeNull()
    expect(results[0].value?.slice(-2)).toBe('1c')
    fixture.dispose()
  })
}

it('rejects responses for another UUID or signing key without consuming the request', async () => {
  const fixture = signerFixture()
  const data = transaction()
  const results: unknown[] = []
  fixture.signer.signTransaction(
    0,
    data,
    (error, result) => results.push(error ?? result),
    fixture.owner.context
  )
  const reference = fixture.reference()
  const frame = fixture.frames(vectors.transactions[0].signature)[0]
  expect(
    fixture.signer.scan(
      reference,
      fixture.owner.context.owner,
      fixture.frames(vectors.transactions[0].signature, '00000000-0000-4000-8000-000000000000')[0]
    )
  ).rejects.toThrow()
  const altered = '01'.repeat(32) + vectors.transactions[0].signature.slice(64)
  expect(
    fixture.signer.scan(reference, fixture.owner.context.owner, fixture.frames(altered)[0])
  ).rejects.toThrow()
  expect(results).toEqual([])
  await fixture.signer.scan(reference, fixture.owner.context.owner, frame)
  expect(results).toEqual([`0x${vectors.transactions[0].signedHex}`])
  fixture.dispose()
})

for (const change of ['abort', 'window', 'close'] as const) {
  it(`cancels the exchange on ${change} before response completion`, async () => {
    const fixture = signerFixture()
    const data = transaction()
    const results: unknown[] = []
    fixture.signer.signTransaction(
      0,
      data,
      (error, result) => results.push(error ?? result),
      fixture.owner.context
    )
    const reference = fixture.reference()
    if (change === 'abort') {
      fixture.owner.abort()
    } else if (change === 'window') {
      fixture.owner.destroy()
    } else {
      fixture.signer.close()
    }
    expect(fixture.signer.getRequest(reference, fixture.owner.context.owner)).toBeUndefined()
    expect(results).toHaveLength(1)
    expect(results[0]).toBeInstanceOf(Error)
    expect(results[0]).toMatchObject({ code: 4001 })
    expect(fixture.owner.listenerCount()).toBe(0)
    expect(
      await fixture.signer.scan(
        reference,
        fixture.owner.context.owner,
        fixture.frames(vectors.transactions[0].signature, reference.sessionId)[0]
      )
    ).toBe(false)
    expect(results).toHaveLength(1)
    fixture.dispose()
  })
}

it('rejects unsupported transaction types, creation and typed-data versions before QR', () => {
  const fixture = signerFixture()
  const errors: unknown[] = []
  for (const raw of [
    { ...transaction(), type: '0x1' },
    { ...transaction(), type: '0x3' },
    { ...transaction(), to: undefined }
  ]) {
    fixture.signer.signTransaction(0, raw, (error) => errors.push(error), fixture.owner.context)
  }
  const data: TypedMessage<SignTypedDataVersion.V3> = {
    version: SignTypedDataVersion.V3,
    data: parseTypedData(Buffer.from(vectors.messages[1].signData, 'hex').toString())
  }
  fixture.signer.signTypedData(0, data, (error) => errors.push(error), fixture.owner.context)
  expect(errors).toHaveLength(4)
  expect(errors.every((error) => error instanceof Error)).toBe(true)
  expect(fixture.signer.summary().airgapRequest).toBeUndefined()
  fixture.dispose()
})
