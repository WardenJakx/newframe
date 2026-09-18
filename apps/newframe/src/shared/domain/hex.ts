import { addHexPrefix } from '@ethereumjs/util'

const weiToHex = (wei: number) => addHexPrefix(wei.toString(16))
export const gweiToHex = (gwei: number) => weiToHex(gwei * 1e9)
export const hexToInt = (hex: string) => parseInt(hex, 16)
export const weiIntToEthInt = (wei: number) => wei / 1e18

export function roundGwei(gwei: number) {
  let rounded: number
  if (gwei >= 10) {
    rounded = Math.round(gwei)
  } else if (gwei >= 5) {
    rounded = Math.round(gwei * 10) / 10
  } else if (gwei >= 1) {
    rounded = Math.round(gwei * 100) / 100
  } else {
    rounded = Math.round(gwei * 1000) / 1000
  }

  return parseFloat(rounded.toString())
}

export const isNonZeroHex = (hex: string) => Boolean(hex && !['0x', '0x0'].includes(hex))
