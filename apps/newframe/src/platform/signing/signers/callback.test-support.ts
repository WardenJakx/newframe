import { expect } from 'bun:test'

import { GasFeesSource, type TransactionData } from '../../../features/transactions/domain/index.js'
import type Signer from './Signer/index.js'

type HotSignerContract = Pick<
  Signer,
  'addresses' | 'close' | 'signMessage' | 'signTransaction' | 'verifyAddress'
> & {
  exportPrivateKey(index: number, cb: Callback<string>): void
}

export function callbackResult<T>(start: (done: Callback<T>) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    start((error, value) => (error ? reject(error) : resolve(value as T)))
  )
}

export async function exerciseHotSignerContract(signer: HotSignerContract, vault: { lock(): void }) {
  const signature = await callbackResult<string>((done) =>
    signer.signMessage(0, '0x' + Buffer.from('test').toString('hex'), done)
  )
  expect(signature).toHaveLength(132)

  const transaction = await callbackResult<string>((done) =>
    signer.signTransaction(
      0,
      {
        nonce: '0x6',
        gasPrice: '0x09184e72a000',
        gasLimit: '0x30000',
        to: '0xfa3caabc8eefec2b5e2895e5afbf79379e7268a7',
        value: '0x0',
        chainId: '0x1',
        type: '0x0',
        gasFeesSource: GasFeesSource.Dapp
      } satisfies TransactionData,
      done
    )
  )
  expect(transaction).toStartWith('0x')
  expect(transaction.length).toBeGreaterThan(2)
  expect(
    await callbackResult<boolean>((done) => signer.verifyAddress(0, signer.addresses[0], false, done))
  ).toBeTrue()
  expect(callbackResult((done) => signer.verifyAddress(0, '0xabcdef', false, done))).rejects.toThrow(
    'Unable to verify address'
  )

  const exported = await callbackResult<string>((done) => signer.exportPrivateKey(0, done))
  expect(exported).toMatch(/^0x[0-9a-f]{64}$/)

  vault.lock()
  expect(callbackResult((done) => signer.signMessage(0, 'test', done))).rejects.toThrow('Signer locked')
  signer.close()
}
