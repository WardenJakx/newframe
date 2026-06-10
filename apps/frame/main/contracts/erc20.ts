import { BrowserProvider, Contract, TransactionDescription } from 'ethers'
import { addHexPrefix } from '@ethereumjs/util'
import provider from '../provider'
import { erc20Interface } from '../../resources/contracts'

export interface TokenData {
  decimals?: number
  name: string
  symbol: string
  totalSupply?: string
}

function createEip1193Wrapper(chainId: number) {
  return {
    request: (request: { method: string; params?: any[] }) =>
      new Promise((resolve, reject) => {
        const wrappedPayload = {
          method: request.method,
          params: request.params || [],
          id: 1,
          jsonrpc: '2.0',
          _origin: 'frame-internal',
          chainId: addHexPrefix(chainId.toString(16))
        } as const

        provider.sendAsync(wrappedPayload, (error: any, response: any) => {
          if (error || response?.error) return reject(error || response.error)
          resolve(response?.result)
        })
      })
  }
}

export default class Erc20Contract {
  private contract: Contract

  constructor(address: Address, chainId: number) {
    const browserProvider = new BrowserProvider(createEip1193Wrapper(chainId))
    this.contract = new Contract(address, erc20Interface, browserProvider)
  }

  static isApproval(data: TransactionDescription) {
    return (
      data.name === 'approve' &&
      data.fragment.inputs.length === 2 &&
      (data.fragment.inputs[0].name || '').toLowerCase().endsWith('spender') &&
      data.fragment.inputs[0].type === 'address' &&
      (data.fragment.inputs[1].name || '').toLowerCase().endsWith('value') &&
      data.fragment.inputs[1].type === 'uint256'
    )
  }

  static isTransfer(data: TransactionDescription) {
    return (
      data.name === 'transfer' &&
      data.fragment.inputs.length === 2 &&
      (data.fragment.inputs[0].name || '').toLowerCase().endsWith('to') &&
      data.fragment.inputs[0].type === 'address' &&
      (data.fragment.inputs[1].name || '').toLowerCase().endsWith('value') &&
      data.fragment.inputs[1].type === 'uint256'
    )
  }

  static decodeCallData(calldata: string) {
    try {
      return erc20Interface.parseTransaction({ data: calldata })
    } catch (e) {
      // call does not match ERC-20 interface
    }
  }

  static encodeCallData(fn: string, params: any[]) {
    return erc20Interface.encodeFunctionData(fn, params)
  }

  async getTokenData(): Promise<TokenData> {
    const calls = await Promise.all([
      this.contract.decimals().catch(() => 0),
      this.contract.name().catch(() => ''),
      this.contract.symbol().catch(() => ''),
      this.contract
        .totalSupply()
        .then((supply: bigint) => supply.toString())
        .catch(() => '') // totalSupply is mandatory on the ERC20 interface
    ])

    return {
      decimals: calls[0],
      name: calls[1],
      symbol: calls[2],
      totalSupply: calls[3]
    }
  }
}
