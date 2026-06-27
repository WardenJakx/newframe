import log from 'electron-log'
import { FunctionFragment, Interface } from 'ethers'

import { fetchWithTimeout } from '../../resources/utils/fetch'

const OPENCHAIN_LOOKUP_URL = 'https://api.openchain.xyz/signature-database/v1/lookup'
const SELECTOR_CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const SELECTOR_ERROR_TTL = 5 * 60 * 1000

const localFunctionSignatures = [
  // ERC-20
  'approve(address spender,uint256 value)',
  'transfer(address to,uint256 value)',
  'transferFrom(address from,address to,uint256 value)',
  'increaseAllowance(address spender,uint256 addedValue)',
  'decreaseAllowance(address spender,uint256 subtractedValue)',

  // ERC-721
  'approve(address to,uint256 tokenId)',
  'setApprovalForAll(address operator,bool approved)',
  'safeTransferFrom(address from,address to,uint256 tokenId)',
  'safeTransferFrom(address from,address to,uint256 tokenId,bytes data)',
  'transferFrom(address from,address to,uint256 tokenId)',

  // ERC-1155
  'safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
  'safeBatchTransferFrom(address from,address to,uint256[] ids,uint256[] amounts,bytes data)',

  // Permit2
  'approve(address token,address spender,uint160 amount,uint48 expiration)',

  // Common wrapped native token methods
  'deposit()',
  'withdraw(uint256 wad)'
]

type SelectorCacheEntry = {
  signatures: string[]
  updatedAt: number
  status: 'success' | 'error'
}

const selectorCache: Record<string, SelectorCacheEntry> = {}

function normalizeSelector(selector: string) {
  const normalized = selector.toLowerCase()
  return normalized.startsWith('0x') ? normalized.slice(0, 10) : `0x${normalized.slice(0, 8)}`
}

function normalizeFunctionSignature(signature: string) {
  const normalized = signature.trim().replace(/^function\s+/i, '')
  return /^[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(normalized) ? normalized : undefined
}

function signatureSelector(signature: string) {
  const normalized = normalizeFunctionSignature(signature)
  if (!normalized) return

  try {
    const fragment = new Interface([`function ${normalized}`]).fragments[0]
    return fragment instanceof FunctionFragment ? fragment.selector : undefined
  } catch {
    return
  }
}

function createLocalSignatureMap() {
  return localFunctionSignatures.reduce<Record<string, string[]>>((signaturesBySelector, signature) => {
    const selector = signatureSelector(signature)
    if (!selector) return signaturesBySelector

    signaturesBySelector[selector] = signaturesBySelector[selector] || []
    signaturesBySelector[selector].push(signature)
    return signaturesBySelector
  }, {})
}

const localSignaturesBySelector = createLocalSignatureMap()

function getCachedSelectorSignatures(selector: string) {
  const cached = selectorCache[selector]
  if (!cached) return

  const ttl = cached.status === 'success' ? SELECTOR_CACHE_TTL : SELECTOR_ERROR_TTL
  if (Date.now() - cached.updatedAt > ttl) return

  return cached.signatures
}

function setCachedSelectorSignatures(
  selector: string,
  signatures: string[],
  status: SelectorCacheEntry['status']
) {
  selectorCache[selector] = { signatures, status, updatedAt: Date.now() }
}

export function clearFunctionSelectorCache() {
  Object.keys(selectorCache).forEach((selector) => {
    delete selectorCache[selector]
  })
}

export function getLocalFunctionSelectorSignatures(selector: string) {
  return localSignaturesBySelector[normalizeSelector(selector)] || []
}

export async function fetchFunctionSelectorSignatures(selector: string) {
  const normalizedSelector = normalizeSelector(selector)
  const cached = getCachedSelectorSignatures(normalizedSelector)
  if (cached) return cached

  try {
    const url = `${OPENCHAIN_LOOKUP_URL}?function=${normalizedSelector}`
    const response = await fetchWithTimeout(url, {}, 3000)
    if (!response.ok) throw new Error(`OpenChain lookup failed with status ${response.status}`)

    const body = (await response.json()) as {
      result?: {
        function?: Record<
          string,
          Array<{
            name?: string
            filtered?: boolean
          }>
        >
      }
    }

    const records = body.result?.function?.[normalizedSelector] || []
    const signatures = [
      ...new Set(
        records
          .filter((record) => !record.filtered && record.name)
          .map((record) => normalizeFunctionSignature(record.name || ''))
          .filter((signature): signature is string => Boolean(signature))
      )
    ]

    setCachedSelectorSignatures(normalizedSelector, signatures, 'success')
    return signatures
  } catch (e) {
    log.warn('Unable to fetch function selector signatures', { selector: normalizedSelector, error: e })
    setCachedSelectorSignatures(normalizedSelector, [], 'error')
    return []
  }
}
