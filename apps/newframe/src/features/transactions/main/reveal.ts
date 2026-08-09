// Reveal details about pending transactions

import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'

import { createProxyProvider } from '../../connections/main/provider/connection.js'
import type { ProviderProxyConnection } from '../../connections/main/provider/proxy.js'
import type { NameResolutionService } from '../../name-resolution/main/nameResolution.js'

import Erc20Contract, { type Erc20ProviderPort } from '../../../platform/chain-rpc/contracts/erc20.js'
import {
  decodeCallData,
  decodeCallDataWithSelectorRegistry,
  fetchContract,
  ContractSource,
  type DecodedCallData
} from '../../../platform/chain-rpc/contracts/index.js'
import ensContracts from '../../../platform/chain-rpc/contracts/deployments/ens/index.js'
import { MAX_HEX } from '../domain/constants.js'

import type { ApproveAction as Erc20Approval, TransferAction as Erc20Transfer } from './actions/erc20.js'
import type { Action, DecodableContract, EntityType } from './actions/index.js'
import type { TransactionRequest } from '../../accounts/main/index.js'

// TODO: fix generic typing here
const knownContracts: DecodableContract<unknown>[] = [...ensContracts]

type RecognitionContext = {
  contractAddress: string
  chainId: number
  account?: string
}

function toHexAmount(value: any) {
  if (typeof value === 'bigint') return addHexPrefix(value.toString(16))
  if (value?.toHexString) return value.toHexString()
  return addHexPrefix(BigInt(value || 0).toString(16))
}

async function resolveEntityType(
  provider: ReturnType<typeof createProxyProvider>,
  address: string,
  chainId: number
): Promise<EntityType> {
  if (!address || !chainId) return 'unknown'
  try {
    const payload: JSONRPCRequestPayload = {
      method: 'eth_getCode',
      params: [address, 'latest'],
      jsonrpc: '2.0',
      id: 1,
      chainId: addHexPrefix(chainId.toString(16)) // TODO: Verify this overrides setChain
    }

    const code = await provider.request(payload)
    const type = code === '0x' || code === '0x0' ? 'external' : 'contract'
    return type
  } catch (e) {
    log.error(e)
    return 'unknown'
  }
}

async function resolveName(nameResolution: NameResolutionService, address: string): Promise<string> {
  try {
    return await nameResolution.reverseLookup(address)
  } catch (e) {
    log.warn(e)
    return ''
  }
}

async function recogErc20(
  erc20Provider: { sendAsync: Erc20ProviderPort['sendAsync'] },
  surface: RevealService,
  contractAddress: string,
  chainId: number,
  calldata: string
): Promise<Action<unknown> | undefined> {
  const decoded = Erc20Contract.decodeCallData(calldata)
  if (contractAddress && decoded) {
    try {
      const contract = new Erc20Contract(contractAddress, chainId, erc20Provider)

      const { decimals, name, symbol } = await contract.getTokenData()
      if (Erc20Contract.isApproval(decoded)) {
        const spenderAddress = decoded.args[0].toLowerCase()
        const amount = toHexAmount(decoded.args[1])

        const [spenderIdentity, contractIdentity] = await Promise.all([
          surface.identity(spenderAddress, chainId),
          surface.identity(contractAddress, chainId)
        ])

        const data = {
          amount,
          decimals,
          name,
          symbol,
          spender: {
            ...spenderIdentity,
            address: spenderAddress
          },
          contract: {
            address: contractAddress,
            ...contractIdentity
          }
        }

        return {
          id: 'erc20:approve',
          data,
          update: (request, { amount }) => {
            // amount is a hex string
            const approvedAmount = BigInt(amount || '0x0').toString()

            log.verbose(
              `Updating Erc20 approve amount to ${approvedAmount} for contract ${contractAddress} and spender ${spenderAddress}`
            )

            const txRequest = request as TransactionRequest

            data.amount = amount
            txRequest.data.data = Erc20Contract.encodeCallData('approve', [spenderAddress, amount])

            if (txRequest.decodedData) {
              txRequest.decodedData.args[1].value = amount === MAX_HEX ? 'unlimited' : approvedAmount
            }
          }
        } as Erc20Approval
      } else if (Erc20Contract.isTransfer(decoded)) {
        const recipient = decoded.args[0].toLowerCase()
        const amount = toHexAmount(decoded.args[1])
        const identity = await surface.identity(recipient, chainId)
        return {
          id: 'erc20:transfer',
          data: {
            recipient: { address: recipient, ...identity },
            amount,
            contract: contractAddress,
            decimals,
            name,
            symbol
          }
        } as Erc20Transfer
      }
    } catch (e) {
      log.warn(e)
    }
  }
}

function identifyKnownContractActions(
  calldata: string,
  context: RecognitionContext
): Action<unknown> | undefined {
  const knownContract = knownContracts.find(
    (contract) =>
      contract.address.toLowerCase() === context.contractAddress.toLowerCase() &&
      contract.chainId === context.chainId
  )

  if (knownContract) {
    try {
      return knownContract.decode(calldata, context)
    } catch (e) {
      log.warn('Could not decode known contract action', { calldata, context }, e)
    }
  }
}

export function createRevealService(proxy: ProviderProxyConnection, nameResolution: NameResolutionService) {
  const provider = createProxyProvider(proxy)
  const erc20Provider = {
    sendAsync(payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) {
      void provider
        .request(payload)
        .then((result) => callback(null, { id: payload.id, jsonrpc: payload.jsonrpc, result }))
        .catch((error) => callback(error as Error))
    }
  }

  provider.setChain('0x1')

  const surface: RevealService = {
    identity: async (address = '', chainId?: number) => {
      // Resolve name, type and other data about address entities
      const results = await Promise.allSettled([
        chainId ? resolveEntityType(provider, address, chainId) : Promise.resolve(''),
        resolveName(nameResolution, address)
      ])

      const type = results[0].status === 'fulfilled' ? results[0].value : ''
      const resolvedName = results[1].status === 'fulfilled' ? results[1].value : ''

      // TODO: Check the address against various scam dbs
      // TODO: Check the address against user's contact list
      // TODO: Check the address against previously verified contracts
      return { type, ens: resolvedName }
    },
    resolveEntityType: (address: string, chainId: number) => resolveEntityType(provider, address, chainId),
    decode: async (contractAddress = '', chainId: number, calldata: string) => {
      // Decode calldata
      const contractSources: ContractSource[] = []
      const contractSource = await fetchContract(contractAddress, chainId)

      if (contractSource) {
        contractSources.push(contractSource)
      }

      for (const { name, source, abi } of contractSources.reverse()) {
        const decodedCall = decodeCallData(calldata, abi)

        if (decodedCall) {
          return {
            contractAddress: contractAddress.toLowerCase(),
            contractName: name,
            source,
            ...decodedCall
          }
        }
      }

      const decodedSelectorCall = await decodeCallDataWithSelectorRegistry(calldata)
      if (decodedSelectorCall) {
        return {
          contractAddress: contractAddress.toLowerCase(),
          contractName: 'Unknown Contract',
          source: 'Function selector registry',
          ...decodedSelectorCall
        }
      }

      log.warn(`Unable to decode data for contract ${contractAddress}`)
    },
    recog: async (calldata: string, context: RecognitionContext) => {
      // Recognize actions from standard tx types
      const actions = ([] as Action<unknown>[]).concat(
        (await recogErc20(erc20Provider, surface, context.contractAddress, context.chainId, calldata)) || [],
        identifyKnownContractActions(calldata, context) || []
      )

      return actions
    },
    simulate: async () => {}
  }

  return surface
}

export type RevealService = {
  identity(address?: string, chainId?: number): Promise<{ type: EntityType | string; ens: string }>
  resolveEntityType(address: string, chainId: number): Promise<EntityType>
  decode(contractAddress: string, chainId: number, calldata: string): Promise<DecodedCallData | undefined>
  recog(calldata: string, context: RecognitionContext): Promise<Action<unknown>[]>
  simulate(): Promise<void>
}
