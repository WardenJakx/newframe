import { SignTypedDataVersion, TypedDataUtils } from '@metamask/eth-sig-util'
import { concat, getBytes, hexlify, keccak256, toBeHex, zeroPadValue } from 'ethers'

import type { TypedData, TypedMessage } from '../accounts/types'

export interface Eip712Digests {
  eip712Digest: string
  domainHash: string
  messageHash: string
}

const eip712DigestVersions = [SignTypedDataVersion.V3, SignTypedDataVersion.V4]

function toHex(bytes: Uint8Array) {
  return hexlify(bytes)
}

export function getEip712Digests(typedMessage: TypedMessage): Eip712Digests | undefined {
  const { data, version } = typedMessage

  if (!eip712DigestVersions.includes(version) || Array.isArray(data)) {
    return undefined
  }

  const typedData = data as TypedData
  const eip712Version = version as SignTypedDataVersion.V3 | SignTypedDataVersion.V4
  const sanitizedData = TypedDataUtils.sanitizeData(typedData)
  const { primaryType, message, types } = sanitizedData

  if (!primaryType || primaryType === 'EIP712Domain') {
    return undefined
  }

  return {
    eip712Digest: toHex(TypedDataUtils.eip712Hash(typedData, eip712Version)),
    domainHash: toHex(TypedDataUtils.eip712DomainHash(typedData, eip712Version)),
    messageHash: toHex(TypedDataUtils.hashStruct(primaryType as string, message, types, eip712Version))
  }
}

export function getCalldataDigest(calldata: string) {
  const data = getBytes(calldata)
  const lengthPrefix = zeroPadValue(toBeHex(data.length), 32)

  return keccak256(concat([lengthPrefix, data]))
}
