import Erc20Contract, { type Erc20ProviderPort } from '../../../platform/chain-rpc/contracts/erc20.js'
import {
  fetchRemoteResource,
  downloadImage,
  readBoundedResponse
} from '../../asset-data/main/images/download.js'
import type { Token } from '../domain/state/token.js'

const MAX_METADATA_BYTES = 256 * 1024
const METADATA_TIMEOUT_MS = 8000

function stringValue(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function imageUrl(value: unknown) {
  const source = stringValue(value, 4096)
  if (!source) {
    return ''
  }
  try {
    return new URL(source).protocol === 'https:' ? source : ''
  } catch {
    return ''
  }
}

async function tokenUriMetadata(uri: string): Promise<Record<string, unknown>> {
  if (uri.startsWith('data:application/json,')) {
    if (uri.length > MAX_METADATA_BYTES * 3) {
      throw new Error('Token metadata is too large')
    }
    return parseMetadata(decodeURIComponent(uri.slice('data:application/json,'.length)))
  }
  if (uri.startsWith('data:application/json;base64,')) {
    const encoded = uri.slice('data:application/json;base64,'.length)
    if (encoded.length > Math.ceil((MAX_METADATA_BYTES * 4) / 3) + 4) {
      throw new Error('Token metadata is too large')
    }
    return parseMetadata(Buffer.from(encoded, 'base64').toString('utf8'))
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS)
  try {
    const response = await fetchRemoteResource(uri, controller.signal)
    if (!response.ok) {
      throw new Error('Could not load token metadata')
    }
    const bytes = await readBoundedResponse(response, MAX_METADATA_BYTES, 'Token metadata is too large')
    return parseMetadata(new TextDecoder().decode(bytes))
  } finally {
    clearTimeout(timeout)
  }
}

function parseMetadata(json: string): Record<string, unknown> {
  if (Buffer.byteLength(json) > MAX_METADATA_BYTES) {
    throw new Error('Token metadata is too large')
  }
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid token metadata')
  }
  return parsed as Record<string, unknown>
}

export async function resolveWatchAsset(
  address: string,
  chainId: number,
  type: 'ERC20' | 'ERC1046',
  options: Record<string, unknown>,
  provider: Erc20ProviderPort
): Promise<Token> {
  const contract = new Erc20Contract(address, chainId, provider)
  const onchain = await contract.getTokenData(type === 'ERC1046')
  let metadata: Record<string, unknown> = {}
  if (type === 'ERC1046') {
    if (!onchain.tokenURI) {
      throw new Error('Contract has no ERC-1046 token URI')
    }
    metadata = await tokenUriMetadata(onchain.tokenURI)
    const interop = metadata.interop
    if (!interop || typeof interop !== 'object' || !('erc1046' in interop) || interop.erc1046 !== true) {
      throw new Error('Token URI does not describe an ERC-1046 asset')
    }
  }

  if (!onchain.totalSupply) {
    throw new Error('Contract is not an ERC-20 token')
  }
  if (
    (onchain.name && metadata.name && onchain.name !== metadata.name) ||
    (onchain.symbol && metadata.symbol && onchain.symbol !== metadata.symbol) ||
    (onchain.decimals !== undefined &&
      metadata.decimals !== undefined &&
      onchain.decimals !== metadata.decimals)
  ) {
    throw new Error('Token URI metadata does not match the contract')
  }
  let name = stringValue(onchain.name, 128)
  if (!name) {
    name = stringValue(metadata.name, 128)
  }
  if (!name) {
    name = stringValue(options.name, 128)
  }
  let symbol = stringValue(onchain.symbol, 32)
  if (!symbol) {
    symbol = stringValue(metadata.symbol, 32)
  }
  if (!symbol) {
    symbol = stringValue(options.symbol, 32)
  }
  const decimals =
    onchain.decimals ?? metadata.decimals ?? options.decimals ?? (type === 'ERC1046' ? 18 : undefined)
  if (
    !name ||
    !symbol ||
    typeof decimals !== 'number' ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw new Error('Token name, symbol, or decimals are unavailable')
  }

  const icons = Array.isArray(metadata.icons) ? metadata.icons : []
  const images = Array.isArray(metadata.images) ? metadata.images : []
  const logoURI =
    [icons[0], metadata.image, images[0], options.image, options.logoURI].map(imageUrl).find(Boolean) ?? ''
  const image = logoURI ? await downloadImage(logoURI) : undefined
  return {
    address,
    chainId,
    name,
    symbol,
    decimals,
    ...(logoURI ? { logoURI } : {}),
    ...(image ? { image } : {})
  }
}
