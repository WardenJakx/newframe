import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'
import type { TransactionDescription } from 'ethers'
import { BrowserProvider, Contract } from 'ethers'

import { erc20Interface } from '../../../shared/domain/evm.js'
import { multicallAddress } from '../multicall/constants.js'
import { aggregate3, type Call } from '../multicall/index.js'
import { queueTokenMetadata, queueTokenMetadataRpc } from './metadataQueue.js'

export interface Erc20ProviderPort {
  sendAsync(payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>): unknown
}

export interface TokenData {
  decimals?: number
  name: string
  symbol: string
  totalSupply?: string
  tokenURI?: string
}

class MulticallUnavailableError extends Error {}
const warnedFallbackChains = new Set<number>()

function isUnavailableMulticall(error: unknown) {
  if (error instanceof MulticallUnavailableError) {
    return true
  }
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }
  return error.code === 'BAD_DATA' || error.code === 'CALL_EXCEPTION'
}

function createEip1193Wrapper(chainId: number, provider: Erc20ProviderPort) {
  return {
    request: (request: { method: string; params?: readonly unknown[] }) =>
      queueTokenMetadataRpc(
        provider,
        () =>
          new Promise((resolve, reject) => {
            const wrappedPayload = {
              method: request.method,
              params: request.params ?? [],
              id: 1,
              jsonrpc: '2.0',
              _origin: 'newframe-internal',
              chainId: addHexPrefix(chainId.toString(16))
            } as const

            provider.sendAsync(wrappedPayload, (error, response) => {
              const responseError = response?.error
              if (error || responseError) {
                return reject(error ?? responseError)
              }
              resolve(response?.result)
            })
          })
      )
  }
}

export default class Erc20Contract {
  private contract: Contract
  private metadataContract: Contract
  private rpc: ReturnType<typeof createEip1193Wrapper>

  constructor(
    private address: Address,
    private chainId: number,
    private provider: Erc20ProviderPort
  ) {
    this.rpc = createEip1193Wrapper(chainId, provider)
    const browserProvider = new BrowserProvider(this.rpc)
    this.contract = new Contract(address, erc20Interface, browserProvider)
    this.metadataContract = new Contract(
      address,
      ['function tokenURI() view returns (string)'],
      browserProvider
    )
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

  static isTransferFrom(data: TransactionDescription) {
    return (
      data.name === 'transferFrom' &&
      data.fragment.inputs.length === 3 &&
      (data.fragment.inputs[0].name || '').toLowerCase().endsWith('from') &&
      data.fragment.inputs[0].type === 'address' &&
      (data.fragment.inputs[1].name || '').toLowerCase().endsWith('to') &&
      data.fragment.inputs[1].type === 'address' &&
      (data.fragment.inputs[2].name || '').toLowerCase().endsWith('value') &&
      data.fragment.inputs[2].type === 'uint256'
    )
  }

  static decodeCallData(calldata: string) {
    try {
      return erc20Interface.parseTransaction({ data: calldata })
    } catch (e) {
      // call does not match ERC-20 interface
    }
  }

  static encodeCallData(fn: string, params: readonly unknown[]) {
    return erc20Interface.encodeFunctionData(fn, params)
  }

  private async individualTokenData(includeTokenURI: boolean): Promise<unknown[]> {
    const decimals = await (this.contract.decimals() as Promise<unknown>).catch(() => undefined)
    const name = await (this.contract.name() as Promise<unknown>).catch(() => '')
    const symbol = await (this.contract.symbol() as Promise<unknown>).catch(() => '')
    const totalSupply = await (this.contract.totalSupply() as Promise<unknown>).catch(() => undefined)
    const tokenURI = includeTokenURI
      ? await (this.metadataContract.tokenURI() as Promise<unknown>).catch(() => undefined)
      : undefined
    return [decimals, name, symbol, totalSupply, tokenURI]
  }

  private async multicallTokenData(includeTokenURI: boolean): Promise<unknown[]> {
    const signatures = [
      'function decimals() view returns (uint8)',
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function totalSupply() view returns (uint256)',
      ...(includeTokenURI ? ['function tokenURI() view returns (string)'] : [])
    ]
    const calls: Call<unknown, unknown>[] = signatures.map((signature) => ({
      target: this.address,
      call: [signature],
      returns: [(value) => value]
    }))
    const results = await aggregate3(calls, async (data) => {
      const response = await this.rpc.request({
        method: 'eth_call',
        params: [{ to: multicallAddress, data }, 'latest']
      })
      if (typeof response !== 'string') {
        throw new MulticallUnavailableError('Invalid Multicall3 response')
      }
      if (response === '0x') {
        throw new MulticallUnavailableError('Multicall3 is not deployed on this chain')
      }
      return response
    })
    return results.map((result) => (result.success ? result.returnValues[0] : undefined))
  }

  async getTokenData(includeTokenURI = false): Promise<TokenData> {
    const key = `${this.chainId}:${this.address.toLowerCase()}:${includeTokenURI}`
    return queueTokenMetadata(this.provider, key, async () => {
      let calls: unknown[]
      try {
        calls = await this.multicallTokenData(includeTokenURI)
      } catch (error) {
        if (!isUnavailableMulticall(error)) {
          throw error
        }
        if (!warnedFallbackChains.has(this.chainId)) {
          warnedFallbackChains.add(this.chainId)
          log.warn('Multicall3 token metadata read failed; using individual RPC calls', {
            chainId: this.chainId,
            address: this.address,
            error
          })
        }
        // Some connected chains lack Multicall3. Keep those tokens addable.
        calls = await this.individualTokenData(includeTokenURI)
      }
      const decimals = calls[0] == null ? undefined : Number(calls[0])
      const name = typeof calls[1] === 'string' ? calls[1] : ''
      const symbol = typeof calls[2] === 'string' ? calls[2] : ''
      const totalSupply =
        typeof calls[3] === 'bigint' || typeof calls[3] === 'string' ? calls[3].toString() : ''

      return {
        decimals:
          decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
            ? decimals
            : undefined,
        name,
        symbol,
        totalSupply,
        ...(includeTokenURI && typeof calls[4] === 'string' ? { tokenURI: calls[4] } : {})
      }
    })
  }
}
