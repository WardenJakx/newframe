import { concat, getBytes, keccak256, toBeHex, zeroPadValue } from 'ethers'

// Clear-signing display digest. Protocol-specific hashes may use a different encoding.
export function getCalldataDigest(calldata: string) {
  const data = getBytes(calldata)
  return keccak256(concat([zeroPadValue(toBeHex(data.length), 32), data]))
}
