import { getAddress as getChecksumAddress } from 'ethers'

export type Address = string // 20 hex bytes, 0x-prefixed

export function getAddress(address: string) {
  const lowerCaseAddress = address.toLowerCase()

  try {
    return getChecksumAddress(lowerCaseAddress)
  } catch (error) {
    console.warn(`could not checksum address ${address}, using lowercase address`, error)
    return lowerCaseAddress
  }
}
