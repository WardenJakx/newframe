// Reveal details about pending transactions

import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'

import proxyConnection from '../provider/proxy'
import { createProxyProvider } from '../provider/connection'
import nameResolution from '../nameResolution'

import Erc20Contract from '../contracts/erc20'
import {
  decodeCallData,
  decodeCallDataWithSelectorRegistry,
  fetchContract,
  ContractSource
} from '../contracts'
import ensContracts from '../contracts/deployments/ens'
import { MAX_HEX } from '../../resources/constants'

import type {
  ApproveAction as Erc20Approval,
  TransferAction as Erc20Transfer
} from '../transaction/actions/erc20'
import type { Action, DecodableContract, EntityType } from '../transaction/actions'
import type { TransactionRequest } from '../accounts'

// TODO: fix generic typing here
const knownContracts: DecodableContract<unknown>[] = [...ensContracts]

const provider = createProxyProvider(proxyConnection)

// TODO: Discuss the need to set chain for the proxy connection
provider.setChain('0x1')

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

async function resolveEntityType(address: string, chainId: number): Promise<EntityType> {
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

async function resolveName(address: string): Promise<string> {
  try {
    return await nameResolution.reverseLookup(address)
  } catch (e) {
    log.warn(e)
    return ''
  }
}

async function recogErc20(
  contractAddress: string,
  chainId: number,
  calldata: string
): Promise<Action<unknown> | undefined> {
  const decoded = Erc20Contract.decodeCallData(calldata)
  if (contractAddress && decoded) {
    try {
      const contract = new Erc20Contract(contractAddress, chainId)

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
          data: { recipient: { address: recipient, ...identity }, amount, decimals, name, symbol }
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

const surface = {
  identity: async (address = '', chainId?: number) => {
    // Resolve name, type and other data about address entities

    const results = await Promise.allSettled([
      chainId ? resolveEntityType(address, chainId) : Promise.resolve(''),
      resolveName(address)
    ])

    const type = results[0].status === 'fulfilled' ? results[0].value : ''
    const resolvedName = results[1].status === 'fulfilled' ? results[1].value : ''

    // TODO: Check the address against various scam dbs
    // TODO: Check the address against user's contact list
    // TODO: Check the address against previously verified contracts
    return { type, ens: resolvedName }
  },
  resolveEntityType,
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
      (await recogErc20(context.contractAddress, context.chainId, calldata)) || [],
      identifyKnownContractActions(calldata, context) || []
    )

    return actions
  },
  simulate: async () => {}
}

export default surface
