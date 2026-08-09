import { addHexPrefix } from '@ethereumjs/util'

const weiToHex = (wei: number) => addHexPrefix(wei.toString(16))
export const gweiToHex = (gwei: number) => weiToHex(gwei * 1e9)
export const hexToInt = (hex: string) => parseInt(hex, 16)
export const weiIntToEthInt = (wei: number) => wei / 1e18

export function roundGwei(gwei: number) {
  const rounded =
    gwei >= 10
      ? Math.round(gwei)
      : gwei >= 5
        ? Math.round(gwei * 10) / 10
        : gwei >= 1
          ? Math.round(gwei * 100) / 100
          : Math.round(gwei * 1000) / 1000

  return parseFloat(rounded.toString())
}

export const isNonZeroHex = (hex: string) => Boolean(hex && !['0x', '0x0'].includes(hex))
