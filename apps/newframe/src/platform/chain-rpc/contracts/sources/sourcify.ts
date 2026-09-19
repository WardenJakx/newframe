import log from 'electron-log'

import { fetchWithTimeout } from '../../network/fetchWithTimeout.js'
import type { ContractSource } from '../index.js'

interface SourcifySourceCodeResponse {
  status: string
  files: Array<{ content: string }>
}

interface SourcifyMetadataFileContent {
  output: {
    abi: unknown[]
    devdoc: { title?: string }
  }
}

function getEndpointUrl(contractAddress: Address, chainId: number) {
  return `https://sourcify.dev/server/files/any/${chainId}/${contractAddress}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseSourceCodeResponse(value: unknown): SourcifySourceCodeResponse | undefined {
  if (!isRecord(value) || typeof value.status !== 'string' || !Array.isArray(value.files)) {
    return undefined
  }

  const files = value.files.flatMap((file: unknown) =>
    isRecord(file) && typeof file.content === 'string' ? [{ content: file.content }] : []
  )
  return files.length ? { status: value.status, files } : undefined
}

function parseMetadataFile(content: string): SourcifyMetadataFileContent | undefined {
  const value: unknown = JSON.parse(content)
  if (!isRecord(value) || !isRecord(value.output) || !Array.isArray(value.output.abi)) {
    return undefined
  }

  const devdoc = isRecord(value.output.devdoc) ? value.output.devdoc : {}
  const title = typeof devdoc.title === 'string' ? devdoc.title : undefined

  return {
    output: {
      abi: value.output.abi.map((entry: unknown) => entry),
      devdoc: title !== undefined ? { title } : {}
    }
  }
}

async function parseResponse(response: Response): Promise<unknown | undefined> {
  if (
    response.status === 200 &&
    (response.headers.get('content-type') ?? '').toLowerCase().includes('json')
  ) {
    return await response.json()
  }
  return Promise.resolve(undefined)
}

async function fetchSourceCode(
  contractAddress: Address,
  chainId: number
): Promise<SourcifyMetadataFileContent | undefined> {
  const endpointUrl = getEndpointUrl(contractAddress, chainId)

  try {
    const res = await fetchWithTimeout(endpointUrl, {}, 4000)
    const parsedResponse = parseSourceCodeResponse(await parseResponse(res))

    return parsedResponse && ['partial', 'full'].includes(parsedResponse.status)
      ? (parseMetadataFile(parsedResponse.files[0].content) ??
          Promise.reject(`Contract ${contractAddress} returned invalid Sourcify metadata`))
      : Promise.reject(`Contract ${contractAddress} not found in Sourcify`)
  } catch (e) {
    log.warn(
      ['AbortError', 'TimeoutError'].includes((e as Error).name)
        ? 'Sourcify request timed out'
        : 'Unable to parse Sourcify response',
      e
    )
    return undefined
  }
}

export async function fetchSourcifyContract(
  contractAddress: Address,
  chainId: number
): Promise<ContractSource | undefined> {
  try {
    const result = await fetchSourceCode(contractAddress, chainId)

    if (result?.output) {
      const {
        abi,
        devdoc: { title }
      } = result.output
      return { abi: JSON.stringify(abi), name: title ?? '', source: 'sourcify' }
    }
  } catch (e) {
    log.warn(`Contract ${contractAddress} not found in Sourcify`, e)
  }
}
