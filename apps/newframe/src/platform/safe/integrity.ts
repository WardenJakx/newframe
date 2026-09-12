import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { Interface } from 'ethers'

import type { SafeProposal } from '../../features/accounts/domain/safe.js'
import { getEip712Digests } from '../signing/signatures/digests.js'

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

export function verifySafeHash(
  proposal: SafeProposal,
  chainId: number,
  address: string,
  version?: string
): NonNullable<SafeProposal['integrity']> {
  // Unknown deployments remain inspectable without guessing their signing domain.
  if (!version || !['1.1.1', '1.2.0', '1.3.0', '1.4.1', '1.5.0'].includes(version))
    return { status: 'unavailable', reason: 'Unable to verify: unsupported or missing Safe version.' }
  if (fields.some(([name]) => proposal[name] === undefined))
    return {
      status: 'unavailable',
      reason: 'Unable to verify: transaction gas or refund fields are missing.'
    }
  const domain = { verifyingContract: address, ...(['1.1.1', '1.2.0'].includes(version) ? {} : { chainId }) }
  const computedHash = getEip712Digests({
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
  })?.eip712Digest
  if (!computedHash) return { status: 'unavailable', reason: 'Unable to compute Safe transaction hash.' }
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

// Compare only lossless scalar service descriptions. Local decoding remains independent.
export function serviceCalldataMismatch(proposal: SafeProposal): boolean {
  const decoded = proposal.dataDecoded
  if (
    !decoded ||
    !/^[A-Za-z_$][\w$]*$/.test(decoded.method) ||
    decoded.parameters.some(
      ({ type }) => !/^(address|bool|string|bytes([1-9]|[12][0-9]|3[0-2])?|u?int([0-9]+)?)$/.test(type)
    )
  )
    return false
  try {
    const abi = new Interface([
      `function ${decoded.method}(${decoded.parameters.map((p) => p.type).join(',')})`
    ])
    const values = decoded.parameters.map((p) =>
      p.type === 'bool' ? (p.value === 'true' ? true : p.value === 'false' ? false : p.value) : p.value
    )
    // Ethers coerces arbitrary strings to bool, so reject anything but literal booleans.
    if (decoded.parameters.some((p) => p.type === 'bool' && !['true', 'false'].includes(p.value)))
      return false
    return abi.encodeFunctionData(decoded.method, values).toLowerCase() !== proposal.data.toLowerCase()
  } catch {
    return false
  }
}
