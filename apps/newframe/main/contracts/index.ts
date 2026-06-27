import log from 'electron-log'
import { FunctionFragment, Interface, hexlify } from 'ethers'
import { fetchSourcifyContract } from './sources/sourcify'
import { fetchEtherscanContract } from './sources/etherscan'
import {
  fetchFunctionSelectorSignatures,
  getLocalFunctionSelectorSignatures
} from './selectors'

// this list should be in order of descending priority as each source will
// be searched in turn
const fetchSources = [fetchSourcifyContract, fetchEtherscanContract]

type ContractSourceResult = ContractSource | undefined

export interface ContractSource {
  abi: string
  name: string
  source: string
}

export interface DecodedCallData {
  contractAddress: string
  contractName: string
  source: string
  selector: string
  signature: string
  method: string
  args: Array<{
    name: string
    type: string
    value: string
  }>
}

function parseAbi(abiData: string): Interface | undefined {
  try {
    return new Interface(abiData)
  } catch (e) {
    log.warn(`could not parse ABI data: ${abiData}`)
  }
}

function normalizeHex(data: string) {
  return data.toLowerCase()
}

function displayValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return hexlify(value)
  if (Array.isArray(value)) return value.map(displayValue).join(',')
  if (value === null || value === undefined) return ''
  return value.toString()
}

function decodeWithFragment(calldata: string, contractInterface: Interface, fragment: FunctionFragment) {
  const decoded = contractInterface.decodeFunctionData(fragment, calldata)
  const reencoded = contractInterface.encodeFunctionData(fragment, decoded)

  if (normalizeHex(reencoded) !== normalizeHex(calldata)) {
    throw new Error('decoded calldata does not round trip to original bytes')
  }

  return {
    selector: calldata.slice(0, 10),
    signature: fragment.format('sighash'),
    method: fragment.name,
    args: fragment.inputs.map((input, i) => ({
      name: input.name || `arg${i}`,
      type: input.type,
      value: displayValue(decoded[i])
    }))
  }
}

function interfaceFromSignature(signature: string) {
  try {
    return new Interface([`function ${signature}`])
  } catch (e) {
    log.warn(`could not parse function signature: ${signature}`)
  }
}

export function decodeCallData(calldata: string, abi: string) {
  const contractInterface = parseAbi(abi)

  if (contractInterface) {
    const sighash = calldata.slice(0, 10)

    try {
      const abiMethod = contractInterface.getFunction(sighash)
      // ethers v6 returns null instead of throwing when no fragment matches
      if (!abiMethod) throw new Error('no matching ABI method')
      return decodeWithFragment(calldata, contractInterface, abiMethod)
    } catch (e) {
      log.warn('unknown ABI method for signature', sighash)
    }
  }
}

export function decodeCallDataWithSignature(calldata: string, signature: string) {
  if (calldata.length < 10) return

  const contractInterface = interfaceFromSignature(signature)
  const fragment = contractInterface?.fragments[0]

  if (contractInterface && fragment instanceof FunctionFragment) {
    try {
      if (fragment.selector.toLowerCase() !== calldata.slice(0, 10).toLowerCase()) return
      return decodeWithFragment(calldata, contractInterface, fragment)
    } catch (e) {
      log.verbose('unable to decode calldata with function selector signature', {
        selector: calldata.slice(0, 10),
        signature
      })
    }
  }
}

export async function decodeCallDataWithSelectorRegistry(calldata: string) {
  if (calldata.length < 10) return

  const selector = calldata.slice(0, 10)
  const localSignatures = getLocalFunctionSelectorSignatures(selector)

  for (const signature of localSignatures) {
    const decoded = decodeCallDataWithSignature(calldata, signature)
    if (decoded) return decoded
  }

  const fetchedSignatures = await fetchFunctionSelectorSignatures(selector)
  const signatures = fetchedSignatures.filter((signature) => !localSignatures.includes(signature))

  for (const signature of signatures) {
    const decoded = decodeCallDataWithSignature(calldata, signature)
    if (decoded) return decoded
  }
}

export async function fetchContract(
  contractAddress: Address,
  chainId: number
): Promise<ContractSourceResult> {
  const fetches = fetchSources.map((getContract) => getContract(contractAddress, chainId))

  let contract: ContractSourceResult = undefined
  let i = 0

  while (!contract && i < fetches.length) {
    contract = await fetches[i]
    i += 1
  }

  if (!contract) {
    log.warn(`could not fetch source code for contract ${contractAddress}`)
  }

  return contract
}
