import { expect, test } from 'bun:test'

import { getBytes, Wallet, ZeroAddress } from 'ethers'

import type { SafeProposal } from '../../features/accounts/domain/safe.js'
import { getEip712Digests } from '../signing/signatures/digests.js'
import {
  getSafeMessageHash,
  getSafeMessageTypedData,
  getSafeTypedMessage,
  packSafeMessageSignatures,
  recoverSafeConfirmationOwner,
  verifySafeConfirmation,
  verifySafeHash,
  verifySafeMessageConfirmation
} from './integrity.js'

const owner = new Wallet(`0x${'12'.repeat(32)}`)
const safe = '0x1111111111111111111111111111111111111111'
const proposal: SafeProposal = {
  safeTxHash: `0x${'00'.repeat(32)}`,
  safe,
  to: owner.address,
  nonce: '9007199254740993',
  value: '123',
  data: '0xabcd',
  operation: 1,
  safeTxGas: '1234',
  baseGas: '5678',
  gasPrice: '90',
  gasToken: ZeroAddress,
  refundReceiver: owner.address,
  confirmations: []
}

test('signs and recovers every supported Safe domain with lossless original fields', () => {
  for (const version of ['1.1.1', '1.2.0', '1.3.0', '1.4.1', '1.5.0']) {
    const typed = getSafeTypedMessage(proposal, 1, safe, version)
    const hash = getEip712Digests(typed)!.eip712Digest
    const signature = owner.signingKey.sign(hash).serialized
    expect(verifySafeConfirmation(hash, owner.address, signature)).toBeTrue()
    expect(verifySafeHash({ ...proposal, safeTxHash: hash }, 1, safe, version).status).toBe('matched')
    for (const field of ['nonce', 'safeTxGas', 'baseGas', 'gasPrice'] as const) {
      const changed = getEip712Digests(
        getSafeTypedMessage({ ...proposal, [field]: '1' }, 1, safe, version)
      )!.eip712Digest
      expect(verifySafeConfirmation(changed, owner.address, signature)).toBeFalse()
    }
    const wrongSafe = getEip712Digests(getSafeTypedMessage(proposal, 1, owner.address, version))!.eip712Digest
    expect(verifySafeConfirmation(wrongSafe, owner.address, signature)).toBeFalse()
    const otherChain = getEip712Digests(getSafeTypedMessage(proposal, 10, safe, version))!.eip712Digest
    expect(otherChain === hash).toBe(['1.1.1', '1.2.0'].includes(version))
  }
})

test('accepts Safe ETH_SIGN and rejects unsupported or malformed signature encodings', async () => {
  const hash = getEip712Digests(getSafeTypedMessage(proposal, 1, safe, '1.4.1'))!.eip712Digest
  const personal = await owner.signMessage(getBytes(hash))
  const signature = `${personal.slice(0, -2)}${(Number.parseInt(personal.slice(-2), 16) + 4).toString(16)}`
  expect(verifySafeConfirmation(hash, owner.address.toLowerCase(), signature)).toBeTrue()
  expect(verifySafeConfirmation(hash, safe, signature)).toBeFalse()
  expect(verifySafeConfirmation(hash, owner.address, personal)).toBeFalse()
  for (const invalid of [
    signature.slice(0, -2),
    `${signature}00`,
    '0x',
    ...['00', '01', '02', '1d', '1e', '21'].map((v) => `${signature.slice(0, -2)}${v}`),
    `0x${'00'.repeat(64)}1b`
  ]) {
    expect(verifySafeConfirmation(hash, owner.address, invalid)).toBeFalse()
  }
})

test('refuses to build signing requests for unknown versions or missing signed fields', () => {
  expect(() => getSafeTypedMessage(proposal, 1, safe, '9.0.0')).toThrow('version')
  expect(() => getSafeTypedMessage({ ...proposal, gasPrice: undefined }, 1, safe, '1.4.1')).toThrow('missing')
  expect(() =>
    getSafeTypedMessage({ ...proposal, operation: 2 } as unknown as SafeProposal, 1, safe, '1.4.1')
  ).toThrow()
})

test('wraps original digests with legacy and modern Safe domains', () => {
  const digest = `0x${'12'.repeat(32)}`
  const legacy = getSafeMessageTypedData(digest, 1, safe, '1.2.0')
  const modern = getSafeMessageTypedData(digest, 1, safe, '1.3.0')
  expect(legacy.data.domain).toEqual({ verifyingContract: safe })
  expect(modern.data.domain).toEqual({ verifyingContract: safe, chainId: 1 })
  expect(getSafeMessageHash('hello', 1, safe, '1.2.0')).toBe(getSafeMessageHash('hello', 10, safe, '1.2.0'))
  expect(getSafeMessageHash('hello', 1, safe, '1.3.0')).not.toBe(
    getSafeMessageHash('hello', 10, safe, '1.3.0')
  )
})

test('recovers current owners and packs EOA confirmations by ascending owner', async () => {
  const wallets = [owner, new Wallet(`0x${'34'.repeat(32)}`)]
  const hash = getSafeMessageHash('sort me', 1, safe, '1.4.1')
  const signatures = wallets.map((wallet) => wallet.signingKey.sign(hash).serialized)
  const descending = wallets
    .map((wallet, index) => ({ owner: wallet.address, signature: signatures[index] }))
    .sort((left, right) => right.owner.toLowerCase().localeCompare(left.owner.toLowerCase()))
  const ascending = [...descending].sort((left, right) =>
    left.owner.toLowerCase().localeCompare(right.owner.toLowerCase())
  )
  expect(recoverSafeConfirmationOwner(hash, signatures[0])).toBe(wallets[0].address)
  expect(
    packSafeMessageSignatures(
      hash,
      wallets.map((wallet) => wallet.address),
      descending
    )
  ).toBe(`0x${ascending.map(({ signature }) => signature.slice(2)).join('')}`)

  const personal = await wallets[0].signMessage(getBytes(hash))
  const safeEthSign = `${personal.slice(0, -2)}${(Number.parseInt(personal.slice(-2), 16) + 4).toString(16)}`
  expect(verifySafeMessageConfirmation(hash, [wallets[0].address], { signature: safeEthSign }).owner).toBe(
    wallets[0].address
  )
})

test('rejects non-owners, duplicate owners, reported-owner mismatches, and malformed confirmations', () => {
  const hash = getSafeMessageHash('reject me', 1, safe, '1.4.1')
  const signature = owner.signingKey.sign(hash).serialized
  expect(() => verifySafeMessageConfirmation(hash, [safe], { signature })).toThrow('owner')
  expect(() => verifySafeMessageConfirmation(hash, [owner.address], { owner: safe, signature })).toThrow(
    'mismatch'
  )
  expect(() => packSafeMessageSignatures(hash, [owner.address], [{ signature }, { signature }])).toThrow(
    'Duplicate'
  )
  expect(() =>
    packSafeMessageSignatures(hash, [owner.address], [{ signature: signature.slice(0, -2) }])
  ).toThrow('owner')
})
