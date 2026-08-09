const protocolRegex = /^(?:ws|http)s?:\/\//
const hexChainIdRegex = /^0x[0-9a-f]+$/i
const decimalChainIdRegex = /^[0-9]+$/
const caipChainIdRegex = /^eip155:([0-9]+)$/i

const extensionPrefixes = {
  chrome: 'chrome-extension',
  firefox: 'moz-extension',
  safari: 'safari-web-extension'
}
const extensionIdentities = ['newframe-extension', 'frame-extension']
const trustedChromeExtensionIds = ['jdlcmcidcpckmaldjiacnbjeajgnmmgj']

type Browser = 'chrome' | 'firefox' | 'safari'

export interface FrameExtension {
  browser: Browser
  id: string
}

export function parseOriginName(origin?: string) {
  return origin ? origin.replace(protocolRegex, '') : 'Unknown'
}

function isValidOriginName(origin: string) {
  return origin === origin.replace(/[^0-9a-z/:.[\]-]/gi, '')
}

export function normalizeRequestChainId(chainId: unknown) {
  const value = Array.isArray(chainId) ? chainId[0] : chainId

  if (typeof value === 'number' && Number.isInteger(value)) {
    return `0x${value.toString(16)}`
  }

  if (typeof value !== 'string' || !value) return undefined

  const trimmed = value.trim()
  const caipMatch = trimmed.match(caipChainIdRegex)

  if (caipMatch) return `0x${Number.parseInt(caipMatch[1], 10).toString(16)}`
  if (hexChainIdRegex.test(trimmed)) return `0x${Number.parseInt(trimmed, 16).toString(16)}`
  if (decimalChainIdRegex.test(trimmed)) return `0x${Number.parseInt(trimmed, 10).toString(16)}`

  return trimmed
}

type RequestHeaders = Record<string, string | string[] | undefined>

export function chainIdFromRequest(headers: RequestHeaders, requestUrl = '/') {
  const headerChainId = normalizeRequestChainId(headers['x-newframe-chain-id'] || headers['x-frame-chain-id'])
  if (headerChainId) return headerChainId

  try {
    const url = new URL(requestUrl, 'http://127.0.0.1')
    return normalizeRequestChainId(url.searchParams.get('chainId') || url.searchParams.get('chain'))
  } catch {
    return undefined
  }
}

export function parseExtensionIdentity({
  origin = '',
  requestUrl = '',
  development
}: {
  origin?: string
  requestUrl?: string
  development: boolean
}): FrameExtension | undefined {
  const query = new URLSearchParams(requestUrl.replace('/', ''))
  const hasExtensionIdentity = extensionIdentities.includes(query.get('identity') || '')
  const chromeExtensionId = trustedChromeExtensionIds.find(
    (id) => origin === `${extensionPrefixes.chrome}://${id}`
  )

  if (chromeExtensionId) return { browser: 'chrome', id: chromeExtensionId }

  if (origin.startsWith(`${extensionPrefixes.chrome}://`) && development && hasExtensionIdentity) {
    return {
      browser: 'chrome',
      id: origin.substring(extensionPrefixes.chrome.length + 3)
    }
  }

  if (origin.startsWith(`${extensionPrefixes.firefox}://`) && hasExtensionIdentity) {
    return {
      browser: 'firefox',
      id: origin.substring(extensionPrefixes.firefox.length + 3)
    }
  }

  if (origin.startsWith(`${extensionPrefixes.safari}://`) && development && hasExtensionIdentity) {
    return { browser: 'safari', id: 'newframe-dev' }
  }
}

type OriginMutation = { type: 'initialize'; chainId: number } | { type: 'touch'; switchToChainId?: number }

export function projectOriginUpdate({
  payload,
  originId,
  existingChainId,
  knownEthereumChainIds,
  connectionMessage
}: {
  payload: JSONRPCRequestPayload
  originId: string
  existingChainId?: number
  knownEthereumChainIds: ReadonlySet<number>
  connectionMessage: boolean
}) {
  const requestedChainId = normalizeRequestChainId(payload.chainId)
  const parsedRequestedChainId =
    requestedChainId && hexChainIdRegex.test(requestedChainId)
      ? Number.parseInt(requestedChainId, 16)
      : undefined
  const knownRequestedChainId =
    parsedRequestedChainId !== undefined && knownEthereumChainIds.has(parsedRequestedChainId)
      ? parsedRequestedChainId
      : undefined
  const defaultChainId = knownRequestedChainId || existingChainId || 1
  const chainId = requestedChainId || `0x${defaultChainId.toString(16)}`
  const projectedPayload = { ...payload, _origin: originId }

  if (payload.chainId || connectionMessage) projectedPayload.chainId = chainId

  let mutation: OriginMutation | undefined
  if (!connectionMessage) {
    mutation =
      existingChainId === undefined
        ? { type: 'initialize', chainId: defaultChainId }
        : {
            type: 'touch',
            ...(knownRequestedChainId && existingChainId !== knownRequestedChainId
              ? { switchToChainId: knownRequestedChainId }
              : {})
          }
  }

  return { payload: projectedPayload, chainId, mutation }
}

export type OriginAuthorizationDecision = 'allow' | 'deny' | 'prompt'

export function decideOriginAuthorization({
  method,
  originName,
  accountSelected,
  providerPermission,
  hasInternalStateCapability
}: {
  method?: string
  originName: string
  accountSelected: boolean
  providerPermission?: boolean
  hasInternalStateCapability: boolean
}): OriginAuthorizationDecision {
  if (method === 'wallet_getEthereumChains' && hasInternalStateCapability) return 'allow'
  if (!isValidOriginName(originName) || !accountSelected) return 'deny'
  if (providerPermission === undefined) return 'prompt'
  return providerPermission ? 'allow' : 'deny'
}
