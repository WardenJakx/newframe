import log from 'electron-log'

import type { RpcIpcHandlers } from '../../../app/main/ipc-handlers/rpc.ts'
import Erc20Contract from '../../../platform/chain-rpc/contracts/erc20.ts'
import type { TokenServicePorts } from './service.ts'

export function createTokenLookupAdapter(provider: RpcIpcHandlers): TokenServicePorts['lookup'] {
  return async (address, chainId) => {
    try {
      const token = await new Erc20Contract(address, chainId, provider).getTokenData()
      if (!token.totalSupply || token.decimals === undefined) {
        return
      }
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
