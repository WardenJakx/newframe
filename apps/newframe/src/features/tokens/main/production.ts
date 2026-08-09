import log from 'electron-log'

import Erc20Contract from '../../../platform/chain-rpc/contracts/erc20.js'
import type { Provider } from '../../connections/main/provider/index.js'
import type { TokenServicePorts } from './service.js'

export function createTokenLookupAdapter(provider: Provider): TokenServicePorts['lookup'] {
  return async (address, chainId) => {
    try {
      const token = await new Erc20Contract(address as Address, chainId, provider).getTokenData()
      if (!token.totalSupply || token.decimals === undefined) return
      return {
        decimals: token.decimals,
        name: token.name,
        symbol: token.symbol,
        totalSupply: token.totalSupply
      }
    } catch (error) {
      log.warn('Could not load token data for contract', { address, chainId, error })
    }
  }
}
