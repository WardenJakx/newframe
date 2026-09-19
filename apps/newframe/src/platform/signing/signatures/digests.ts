import { SignTypedDataVersion, typedSignatureHash, TypedDataUtils } from '@metamask/eth-sig-util'
import { getBytes, hashMessage, hexlify, isHexString } from 'ethers'
export { getCalldataDigest } from '../../../shared/domain/calldata.js'

import type { TypedData, TypedMessage } from '../../../features/requests/contract/requests.js'

export interface Eip712Digests {
  eip712Digest: string
  domainHash: string
  messageHash: string
}

const eip712DigestVersions = [SignTypedDataVersion.V3, SignTypedDataVersion.V4]

function toHex(bytes: Uint8Array) {
  return hexlify(bytes)
}

export type OriginalMessage = string | TypedMessage

/** Returns the digest signed by an EOA before Safe wraps it in SafeMessage(bytes). */
export function getOriginalMessageDigest(message: OriginalMessage): string {
  if (typeof message === 'string') {
    return hashMessage(isHexString(message) ? getBytes(message) : message)
  }
  const { data, version } = message
  if (version === SignTypedDataVersion.V1) {
    if (!Array.isArray(data)) {
      throw new Error('Invalid V1 typed message')
    }
    return typedSignatureHash(data)
  }
  if (![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(version) || Array.isArray(data)) {
    throw new Error('Unsupported typed message version')
  }
  return toHex(TypedDataUtils.eip712Hash(data, version))
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

  try {
    return {
      eip712Digest: toHex(TypedDataUtils.eip712Hash(typedData, eip712Version)),
      domainHash: toHex(TypedDataUtils.eip712DomainHash(typedData, eip712Version)),
      messageHash: toHex(TypedDataUtils.hashStruct(primaryType as string, message, types, eip712Version))
    }
  } catch {
    return undefined
  }
}
