import { intToHex } from '@ethereumjs/util'

export const gweiToHex = (gwei: number) => intToHex(gwei * 1e9)
