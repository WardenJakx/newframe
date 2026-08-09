import { expect, it } from 'bun:test'

import { createDeferredAccountTransactionPolicyPort } from './accountPolicyPort'

it('fails closed without a transaction policy and restores nested bindings', () => {
  const deferred = createDeferredAccountTransactionPolicyPort()
  const transaction = { chainId: '0x1' } as never
  const signer = { type: 'seed' } as never

  expect(() => deferred.port.maxFee(transaction)).toThrow(
    'Account transaction policy capability is not connected'
  )

  const disconnectFirst = deferred.connect({
    maxFee: () => 1,
    signerCompatibility: () => ({ signer: 'seed', tx: 'legacy', compatible: true })
  })
  const disconnectSecond = deferred.connect({
    maxFee: () => 2,
    signerCompatibility: () => ({ signer: 'ledger', tx: 'london', compatible: false })
  })

  expect(deferred.port.maxFee(transaction)).toBe(2)
  expect(deferred.port.signerCompatibility(transaction, signer)).toEqual({
    signer: 'ledger',
    tx: 'london',
    compatible: false
  })

  disconnectSecond()
  expect(deferred.port.maxFee(transaction)).toBe(1)
  disconnectFirst()
  expect(() => deferred.port.maxFee(transaction)).toThrow(
    'Account transaction policy capability is not connected'
  )
})
