import { Common, createCustomCommon, Holesky, Mainnet, Sepolia } from '@ethereumjs/common'

import type { ChainConfig } from '@ethereumjs/common'

const knownChains: Record<number, ChainConfig> = {
  1: Mainnet,
  17000: Holesky,
  11155111: Sepolia
}

function chainConfig(chain: number, hardfork: string) {
  return chain in knownChains
    ? new Common({ chain: knownChains[chain], hardfork })
    : createCustomCommon({ chainId: chain }, Mainnet, { hardfork })
}

export default chainConfig
