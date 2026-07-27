import type { IncomingMessage } from 'http'
import { v5 as uuidv5 } from 'uuid'

import type { Accounts } from '../accounts/index.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import { hasPrincipalCapability, type RpcPrincipal } from '../authority.js'
import {
  chainIdFromRequest,
  decideOriginAuthorization,
  normalizeRequestChainId,
  parseExtensionIdentity,
  parseOriginName,
  projectOriginUpdate,
  type FrameExtension
} from '../../domain/origin/index.js'

import type { Permission } from '../store/state/index.js'
import type { AccessRequest } from '../../contracts/requests.js'

export type { FrameExtension } from '../../domain/origin/index.js'

interface OriginStorePort {
  getOrigin(id: string): { name: string; chain?: { id: number } } | undefined
  getKnownEthereumChainIds(): ReadonlySet<number>
  initializeOrigin(id: string, origin: { name: string; chain: { id: number; type: 'ethereum' } }): void
  touchOrigin(id: string): void
  switchOriginChain(id: string, chainId: number): void
  getPermission(address: Address, origin: string): Permission | undefined
  getKnownExtension(id: string): boolean | undefined
  subscribeKnownExtension(id: string, handler: (allowed: boolean) => void): () => void
  notifyExtension(extension: FrameExtension): void
}

interface AccountAccessPort {
  current(): { address: Address } | null | undefined
  routeRequest(principal: RpcPrincipal, request: AccessRequest, callback: () => void): void
}

export interface OriginsServiceDependencies {
  store: OriginStorePort
  accounts: AccountAccessPort
  hasInternalStateCapability(principal: RpcPrincipal): boolean
  development(): boolean
}

export function createOriginsService(dependencies: OriginsServiceDependencies) {
  const activeExtensionChecks = new Map<string, Promise<boolean>>()
  const activePermissionChecks = new Map<string, Promise<Permission | undefined>>()

  const updateOrigin = (requestPayload: JSONRPCRequestPayload, origin: string, connectionMessage = false) => {
    const originId = uuidv5(origin, uuidv5.DNS)
    const existingOrigin = dependencies.store.getOrigin(originId)
    const result = projectOriginUpdate({
      payload: requestPayload,
      originId,
      existingChainId: existingOrigin?.chain?.id,
      knownEthereumChainIds: dependencies.store.getKnownEthereumChainIds(),
      connectionMessage
    })

    if (result.mutation?.type === 'initialize') {
      dependencies.store.initializeOrigin(originId, {
        name: origin,
        chain: { id: result.mutation.chainId, type: 'ethereum' }
      })
    } else if (result.mutation?.type === 'touch') {
      dependencies.store.touchOrigin(originId)
      if (result.mutation.switchToChainId !== undefined) {
        dependencies.store.switchOriginChain(originId, result.mutation.switchToChainId)
      }
    }

    return { payload: result.payload as RPCRequestPayload, chainId: result.chainId }
  }

  const parseFrameExtension = (req: IncomingMessage) =>
    parseExtensionIdentity({
      origin: req.headers.origin,
      requestUrl: req.url,
      development: dependencies.development()
    })

  const requestExtensionPermission = (extension: FrameExtension) => {
    const activeCheck = activeExtensionChecks.get(extension.id)
    if (activeCheck) return activeCheck

    const result = new Promise<boolean>((resolve) => {
      const unsubscribe = dependencies.store.subscribeKnownExtension(extension.id, (isAllowed) => {
        if (!activeExtensionChecks.has(extension.id)) return
        activeExtensionChecks.delete(extension.id)
        unsubscribe()
        resolve(isAllowed)
      })
    })

    activeExtensionChecks.set(extension.id, result)
    dependencies.store.notifyExtension(extension)
    return result
  }

  const isKnownExtension = async (extension: FrameExtension) => {
    if (extension.browser === 'chrome' || extension.browser === 'safari') return true

    const extensionPermission = dependencies.store.getKnownExtension(extension.id)
    return extensionPermission ?? requestExtensionPermission(extension)
  }

  const requestPermission = (address: Address, fullPayload: RPCRequestPayload, principal: RpcPrincipal) => {
    const { _origin: originId, ...payload } = fullPayload
    const permissionCheckId = `${address}:${originId}`
    const activeCheck = activePermissionChecks.get(permissionCheckId)
    if (activeCheck) return activeCheck

    let resolveCheck!: (permission: Permission | undefined) => void
    let rejectCheck!: (error: unknown) => void
    const result = new Promise<Permission | undefined>((resolve, reject) => {
      resolveCheck = resolve
      rejectCheck = reject
    })
    activePermissionChecks.set(permissionCheckId, result)
    const request: AccessRequest = {
      payload,
      handlerId: originId,
      type: 'access',
      origin: originId,
      account: address
    }

    try {
      dependencies.accounts.routeRequest(principal, request, () => {
        const originName = dependencies.store.getOrigin(originId)?.name || 'Unknown'
        const permission = dependencies.store.getPermission(address, originName)

        activePermissionChecks.delete(permissionCheckId)
        resolveCheck(permission)
      })
    } catch (error) {
      activePermissionChecks.delete(permissionCheckId)
      rejectCheck(error)
    }
    return result
  }

  const isTrusted = async (payload: RPCRequestPayload, principal: RpcPrincipal) => {
    const originName = dependencies.store.getOrigin(payload._origin)?.name || 'Unknown'
    const currentAccount = dependencies.accounts.current()
    const permission = currentAccount
      ? dependencies.store.getPermission(currentAccount.address, originName)
      : undefined
    const decision = decideOriginAuthorization({
      method: payload.method,
      originName,
      accountSelected: Boolean(currentAccount),
      providerPermission: permission?.provider,
      hasInternalStateCapability: dependencies.hasInternalStateCapability(principal)
    })

    if (decision === 'allow') return true
    if (decision === 'deny' || !currentAccount) return false

    return Boolean((await requestPermission(currentAccount.address, payload, principal))?.provider)
  }

  return { isKnownExtension, isTrusted, parseFrameExtension, updateOrigin }
}

export const parseOrigin = parseOriginName
export { normalizeRequestChainId }
export const parseRequestChainId = (req: IncomingMessage) => chainIdFromRequest(req.headers, req.url)

export function createProductionOriginsService(store: CanonicalStoreReader, accounts: Accounts) {
  const productionStore: OriginStorePort = {
    getOrigin: (id) => store.getState().main.origins[id],
    getKnownEthereumChainIds: () => new Set(Object.keys(store.getState().main.networks.ethereum).map(Number)),
    initializeOrigin: (id, origin) => store.getState().initOrigin(id, origin),
    touchOrigin: (id) => store.getState().addOriginRequest(id),
    switchOriginChain: (id, chainId) => store.getState().switchOriginChain(id, chainId, 'ethereum'),
    getPermission: (address, origin) => {
      const permissions: Record<string, Permission> = store.getState().main.permissions[address] || {}
      return Object.values(permissions).find((permission) => permission.origin === origin)
    },
    getKnownExtension: (id) => store.getState().main.knownExtensions[id] as boolean | undefined,
    subscribeKnownExtension: (id, handler) =>
      store.subscribe(
        (state) => state.main.knownExtensions[id],
        (allowed) => {
          if (typeof allowed !== 'undefined') handler(allowed)
        }
      ),
    notifyExtension: (extension) => store.getState().notify('extensionConnect', extension)
  }

  return createOriginsService({
    store: productionStore,
    accounts,
    hasInternalStateCapability: (principal) => hasPrincipalCapability(principal, 'wallet:internal-state'),
    development: () => process.env.NODE_ENV === 'development'
  })
}

export type OriginsService = ReturnType<typeof createOriginsService>
