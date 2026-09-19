import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { getAddress, getBytes, hashMessage, Interface, recoverAddress } from 'ethers'

import {
  safeAddressSchema,
  safeProposalSchema,
  type SafeProposal
} from '../../features/accounts/domain/safe.js'
import type { TypedMessage } from '../../features/requests/contract/requests.js'
import {
  getEip712Digests,
  getOriginalMessageDigest,
  type OriginalMessage
} from '../signing/signatures/digests.js'

export const EIP1271_MAGIC_VALUE = '0x1626ba7e'
export const EIP1271_SIGNATURE =
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'

const supportedSafeVersions = ['1.1.1', '1.2.0', '1.3.0', '1.4.1', '1.5.0']

function safeDomain(chainId: number, address: string, version?: string) {
  if (!version || !supportedSafeVersions.includes(version)) {
    throw new Error('Unable to verify: unsupported or missing Safe version.')
  }
  const safe = safeAddressSchema.parse(address)
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Invalid Safe chain ID')
  }
  return {
    verifyingContract: safe,
    ...(['1.1.1', '1.2.0'].includes(version) ? {} : { chainId })
  }
}

const fields = [
  ['to', 'address'],
  ['value', 'uint256'],
  ['data', 'bytes'],
  ['operation', 'uint8'],
  ['safeTxGas', 'uint256'],
  ['baseGas', 'uint256'],
  ['gasPrice', 'uint256'],
  ['gasToken', 'address'],
  ['refundReceiver', 'address'],
  ['nonce', 'uint256']
] as const

export function getSafeTypedMessage(
  proposal: SafeProposal,
  chainId: number,
  address: string,
  version?: string
): TypedMessage {
  if (fields.some(([name]) => proposal[name] === undefined)) {
    throw new Error('Unable to verify: transaction gas or refund fields are missing.')
  }
  safeProposalSchema.parse(proposal)
  const domain = safeDomain(chainId, address, version)
  return {
    version: SignTypedDataVersion.V4,
    data: {
      primaryType: 'SafeTx',
      domain,
      types: {
        EIP712Domain: [
          ...('chainId' in domain ? [{ name: 'chainId', type: 'uint256' }] : []),
          { name: 'verifyingContract', type: 'address' }
        ],
        SafeTx: fields.map(([name, type]) => ({ name, type }))
      },
      message: Object.fromEntries(fields.map(([name]) => [name, proposal[name]]))
    }
  }
}

export function getSafeMessageTypedData(
  originalDigest: string,
  chainId: number,
  address: string,
  version?: string
): TypedMessage<SignTypedDataVersion.V4> {
  if (!/^0x[0-9a-f]{64}$/i.test(originalDigest)) {
    throw new Error('Invalid original message digest')
  }
  const domain = safeDomain(chainId, address, version)
  return {
    version: SignTypedDataVersion.V4,
    data: {
      primaryType: 'SafeMessage',
      domain,
      types: {
        EIP712Domain: [
          ...('chainId' in domain ? [{ name: 'chainId', type: 'uint256' }] : []),
          { name: 'verifyingContract', type: 'address' }
        ],
        SafeMessage: [{ name: 'message', type: 'bytes' }]
      },
      message: { message: originalDigest }
    }
  }
}

export function getSafeMessageHash(
  message: OriginalMessage,
  chainId: number,
  address: string,
  version?: string
): string {
  const digest = getEip712Digests(
    getSafeMessageTypedData(getOriginalMessageDigest(message), chainId, address, version)
  )?.eip712Digest
  if (!digest) {
    throw new Error('Unable to compute Safe message hash')
  }
  return digest
}

export function verifySafeHash(
  proposal: SafeProposal,
  chainId: number,
  address: string,
  version?: string
): NonNullable<SafeProposal['integrity']> {
  let typedMessage: TypedMessage
  try {
    typedMessage = getSafeTypedMessage(proposal, chainId, address, version)
  } catch (error) {
    return { status: 'unavailable', reason: (error as Error).message }
  }
  const computedHash = getEip712Digests(typedMessage)?.eip712Digest
  if (!computedHash) {
    return { status: 'unavailable', reason: 'Unable to compute Safe transaction hash.' }
  }
  return computedHash === proposal.safeTxHash
    ? {
        status: 'matched',
        computedHash,
        reason: 'Hash matches locally computed transaction. Owner signatures are not verified.'
      }
    : {
        status: 'mismatch',
        computedHash,
        reason: 'Integrity mismatch: the service hash does not match this transaction.'
      }
}

// Safe stores eth_sign recovery values as 31/32, EIP712 as 27/28.
export function verifySafeConfirmation(hash: string, owner: string, signature: string): boolean {
  const recovered = recoverSafeConfirmationOwner(hash, signature)
  return recovered !== undefined && recovered.toLowerCase() === owner.toLowerCase()
}

export function recoverSafeConfirmationOwner(hash: string, signature: string): string | undefined {
  if (!/^0x[0-9a-f]{64}$/i.test(hash) || !/^0x[0-9a-f]{130}$/i.test(signature)) {
    return undefined
  }
  const v = Number.parseInt(signature.slice(-2), 16)
  if (![27, 28, 31, 32].includes(v)) {
    return undefined
  }
  try {
    const digest = v > 30 ? hashMessage(getBytes(hash)) : hash
    const normalized = `${signature.slice(0, -2)}${(v > 30 ? v - 4 : v).toString(16).padStart(2, '0')}`
    return getAddress(recoverAddress(digest, normalized))
  } catch {
    return undefined
  }
}

export interface SafeMessageConfirmationInput {
  owner?: string
  signature: string
}

export interface VerifiedSafeMessageConfirmation {
  owner: string
  signature: string
}

export function verifySafeMessageConfirmation(
  hash: string,
  currentOwners: readonly string[],
  confirmation: SafeMessageConfirmationInput
): VerifiedSafeMessageConfirmation {
  const owners = new Set(currentOwners.map((owner) => safeAddressSchema.parse(owner).toLowerCase()))
  const owner = recoverSafeConfirmationOwner(hash, confirmation.signature)
  if (!owner || !owners.has(owner.toLowerCase())) {
    throw new Error('Invalid Safe message owner signature')
  }
  if (confirmation.owner && safeAddressSchema.parse(confirmation.owner) !== owner) {
    throw new Error('Safe message confirmation owner mismatch')
  }
  return { owner, signature: confirmation.signature }
}

export function packSafeMessageSignatures(
  hash: string,
  currentOwners: readonly string[],
  confirmations: readonly SafeMessageConfirmationInput[]
): string {
  const verified = confirmations.map((confirmation) =>
    verifySafeMessageConfirmation(hash, currentOwners, confirmation)
  )
  const unique = new Set(verified.map(({ owner }) => owner.toLowerCase()))
  if (unique.size !== verified.length) {
    throw new Error('Duplicate Safe message confirmation')
  }
  verified.sort((left, right) => left.owner.toLowerCase().localeCompare(right.owner.toLowerCase()))
  return `0x${verified.map(({ signature }) => signature.slice(2)).join('')}`
}

export function isEip1271MagicValue(result: string): boolean {
  return result.toLowerCase() === EIP1271_MAGIC_VALUE
}

// Compare only lossless scalar service descriptions. Local decoding remains independent.
export function serviceCalldataMismatch(proposal: SafeProposal): boolean {
  const decoded = proposal.dataDecoded
  if (
    !decoded ||
    !/^[A-Za-z_$][\w$]*$/.test(decoded.method) ||
    decoded.parameters.some(
      ({ type }) => !/^(address|bool|string|bytes([1-9]|[12][0-9]|3[0-2])?|u?int([0-9]+)?)$/.test(type)
    )
  ) {
    return false
  }
  try {
    const abi = new Interface([
      `function ${decoded.method}(${decoded.parameters.map((p) => p.type).join(',')})`
    ])
    const values = decoded.parameters.map((p) => {
      if (p.type !== 'bool') {
        return p.value
      }
      if (p.value === 'true') {
        return true
      }
      return p.value === 'false' ? false : p.value
    })
    // Ethers coerces arbitrary strings to bool, so reject anything but literal booleans.
    if (decoded.parameters.some((p) => p.type === 'bool' && !['true', 'false'].includes(p.value))) {
      return false
    }
    return abi.encodeFunctionData(decoded.method, values).toLowerCase() !== proposal.data.toLowerCase()
  } catch {
    return false
  }
}
