import { v5 as uuidv5 } from 'uuid'
import { IncomingMessage } from 'http'

import accounts, { AccessRequest } from '../accounts'
import store from '../store'

import type { Permission } from '../store/state'

const isDev = () => process.env.NODE_ENV === 'development'

const activeExtensionChecks: Record<string, Promise<boolean>> = {}
const activePermissionChecks: Record<string, Promise<Permission | undefined>> = {}
const extensionPrefixes = {
  chrome: 'chrome-extension',
  firefox: 'moz-extension',
  safari: 'safari-web-extension'
}

const protocolRegex = /^(?:ws|http)s?:\/\//
const hexChainIdRegex = /^0x[0-9a-f]+$/i
const decimalChainIdRegex = /^[0-9]+$/
const caipChainIdRegex = /^eip155:([0-9]+)$/i

interface OriginUpdateResult {
  payload: RPCRequestPayload
  chainId: string
}

type Browser = 'chrome' | 'firefox' | 'safari'

export interface FrameExtension {
  browser: Browser
  id: string
}

// allows the Newframe extension to request specific methods
const trustedInternalMethods = ['wallet_getEthereumChains']

const extensionIdentities = ['newframe-extension', 'frame-extension']
const internalOrigins = ['newframe-extension', 'newframe-internal', 'frame-extension', 'frame-internal']
const isTrustedOrigin = (origin: string) => internalOrigins.includes(origin)
const isInternalMethod = (method: string) => trustedInternalMethods.includes(method)

const storeApi = {
  getPermission: (address: Address, origin: string) => {
    const permissions: Record<string, Permission> = store.getState().main.permissions[address] || {}
    return Object.values(permissions).find((p) => p.origin === origin)
  },
  getKnownExtension: (id: string) => store.getState().main.knownExtensions[id] as boolean
}

export function parseOrigin(origin?: string) {
  if (!origin) return 'Unknown'

  return origin.replace(protocolRegex, '')
}

function invalidOrigin(origin: string) {
  return origin !== origin.replace(/[^0-9a-z/:.[\]-]/gi, '')
}

export function normalizeRequestChainId(chainId: unknown) {
  const value = Array.isArray(chainId) ? chainId[0] : chainId

  if (typeof value === 'number' && Number.isInteger(value)) {
    return `0x${value.toString(16)}`
  }

  if (typeof value !== 'string' || !value) return undefined

  const trimmed = value.trim()
  const caipMatch = trimmed.match(caipChainIdRegex)

  if (caipMatch) {
    return `0x${parseInt(caipMatch[1], 10).toString(16)}`
  }

  if (hexChainIdRegex.test(trimmed)) {
    return `0x${parseInt(trimmed, 16).toString(16)}`
  }

  if (decimalChainIdRegex.test(trimmed)) {
    return `0x${parseInt(trimmed, 10).toString(16)}`
  }

  return trimmed
}

export function parseRequestChainId(req: IncomingMessage) {
  const headerChainId = normalizeRequestChainId(
    req.headers['x-newframe-chain-id'] || req.headers['x-frame-chain-id']
  )

  if (headerChainId) return headerChainId

  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    return normalizeRequestChainId(url.searchParams.get('chainId') || url.searchParams.get('chain'))
  } catch {
    return undefined
  }
}

function knownEthereumChainId(chainId?: string) {
  if (!chainId || !hexChainIdRegex.test(chainId)) return undefined

  const id = parseInt(chainId, 16)

  if (!Number.isInteger(id)) return undefined

  return store.getState().main.networks.ethereum[id] ? id : undefined
}

async function getPermission(address: Address, origin: string, payload: RPCRequestPayload) {
  const permission = storeApi.getPermission(address, origin)

  return permission || requestPermission(address, payload)
}

async function requestExtensionPermission(extension: FrameExtension) {
  if (extension.id in activeExtensionChecks) {
    return activeExtensionChecks[extension.id]
  }

  const result = new Promise<boolean>((resolve) => {
    const unsubscribe = store.subscribe(
      (state) => state.main.knownExtensions[extension.id],
      (isAllowed) => {
        const isActive = extension.id in activeExtensionChecks

        // wait for a response
        if (isActive && typeof isAllowed !== 'undefined') {
          delete activeExtensionChecks[extension.id]
          unsubscribe()
          resolve(isAllowed)
        }
      }
    )
  })

  activeExtensionChecks[extension.id] = result
  store.getState().notify('extensionConnect', extension)

  return result
}

async function requestPermission(address: Address, fullPayload: RPCRequestPayload) {
  const { _origin: originId, ...payload } = fullPayload
  const permissionCheckId = `${address}:${originId}`

  if (permissionCheckId in activePermissionChecks) {
    return activePermissionChecks[permissionCheckId]
  }

  const result = new Promise<Permission | undefined>((resolve) => {
    const request: AccessRequest = {
      payload,
      handlerId: originId,
      type: 'access',
      origin: originId,
      account: address
    }

    accounts.addRequest(request, () => {
      const { name: originName } = store.getState().main.origins[originId]
      const permission = storeApi.getPermission(address, originName)

      delete activePermissionChecks[permissionCheckId]
      resolve(permission)
    })
  })

  activePermissionChecks[permissionCheckId] = result

  return result
}

export function updateOrigin(
  requestPayload: JSONRPCRequestPayload,
  origin: string,
  connectionMessage = false
): OriginUpdateResult {
  const originId = uuidv5(origin, uuidv5.DNS)
  const existingOrigin = store.getState().main.origins[originId]

  const requestedChainId = normalizeRequestChainId(requestPayload.chainId)
  const requestedKnownChainId = knownEthereumChainId(requestedChainId)
  const defaultChainId = requestedKnownChainId || existingOrigin?.chain.id || 1

  if (!connectionMessage) {
    // the extension will attempt to send messages (eth_chainId and net_version) in order
    // to connect. we don't want to store these origins as they'll come from every site
    // the user visits in their browser

    if (existingOrigin) {
      store.getState().addOriginRequest(originId)
      if (requestedKnownChainId && existingOrigin.chain.id !== requestedKnownChainId) {
        store.getState().switchOriginChain(originId, requestedKnownChainId, 'ethereum')
      }
    } else {
      store.getState().initOrigin(originId, {
        name: origin,
        chain: {
          id: defaultChainId,
          type: 'ethereum'
        }
      })
    }
  }

  const chainId = requestedChainId || `0x${defaultChainId.toString(16)}`

  const payload = {
    ...requestPayload,
    _origin: originId
  }

  if (requestPayload.chainId || connectionMessage) {
    payload.chainId = chainId
  }

  return {
    payload,
    chainId
  }
}

export function parseFrameExtension(req: IncomingMessage): FrameExtension | undefined {
  const origin = req.headers.origin || ''

  const query = new URLSearchParams((req.url || '').replace('/', ''))
  const hasExtensionIdentity = extensionIdentities.includes(query.get('identity') || '')

  const trustedChromeExtensionIds = [
    // Production Chrome Web Store ID hidden until a replacement listing exists:
    // 'ldcoohedfbjoobcadoglnnmmfbdlmmhf',
    'jdlcmcidcpckmaldjiacnbjeajgnmmgj' // local unpacked build
  ]

  const chromeExtensionId = trustedChromeExtensionIds.find(
    (id) => origin === `${extensionPrefixes.chrome}://${id}`
  )

  if (chromeExtensionId) {
    return { browser: 'chrome', id: chromeExtensionId }
  } else if (origin.startsWith(`${extensionPrefixes.chrome}://`) && isDev() && hasExtensionIdentity) {
    // Match Chrome in dev
    const extensionId = origin.substring(extensionPrefixes.chrome.length + 3)
    return { browser: 'chrome', id: extensionId }
  } else if (origin.startsWith(`${extensionPrefixes.firefox}://`) && hasExtensionIdentity) {
    // Match production Firefox
    const extensionId = origin.substring(extensionPrefixes.firefox.length + 3)
    return { browser: 'firefox', id: extensionId }
  } else if (origin.startsWith(`${extensionPrefixes.safari}://`) && isDev() && hasExtensionIdentity) {
    // Match Safari in dev only
    return { browser: 'safari', id: 'newframe-dev' }
  }
}

export async function isKnownExtension(extension: FrameExtension) {
  if (extension.browser === 'chrome' || extension.browser === 'safari') return true

  const extensionPermission = storeApi.getKnownExtension(extension.id)

  return extensionPermission ?? requestExtensionPermission(extension)
}

export async function isTrusted(payload: RPCRequestPayload) {
  // Permission granted to unknown origins only persist until Newframe is closed, they are not permanent
  const { name: originName } = store.getState().main.origins[payload._origin] as { name: string }
  const currentAccount = accounts.current()

  if (isTrustedOrigin(originName) && isInternalMethod(payload.method)) {
    return true
  }

  if (invalidOrigin(originName) || !currentAccount) {
    return false
  }

  const permission = await getPermission(currentAccount.address, originName, payload)

  return !!permission?.provider
}
