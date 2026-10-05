import type { IncomingMessage } from 'http'

import log from 'electron-log'
import { v5 as uuidv5 } from 'uuid'

import { hasSourceCapability, type LocalApiSource } from '../../../app/main/gateway/requestSource.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Permission } from '../../../platform/state-store/state/index.ts'
import type { Address } from '../../../shared/domain/address.ts'
import type { JSONRPCRequestPayload, RPCRequestPayload } from '../../../shared/domain/rpc.ts'
import type { Accounts } from '../../accounts/main/index.ts'
import type { AccessRequest } from '../../requests/contract/requests.ts'
import type { PromptedRequestContinuationPort } from '../../requests/main/service.ts'
import { activeExtensionAccountId } from '../domain/extensionAccess.ts'
import {
  chainIdFromRequest,
  decideOriginAuthorization,
  parseExtensionIdentity,
  parseOriginName,
  projectOriginUpdate,
  requestedAccount,
  type FrameExtension
} from '../domain/index.ts'
import { createExtensionAccessService } from './extensionAccess.ts'

export type { FrameExtension } from '../domain/index.ts'

type OriginRequestContinuationPort = Pick<PromptedRequestContinuationPort, 'create'> & {
  cancel(requestId: string): boolean
}

interface OriginStorePort {
  getOrigin(id: string): { name: string; chain?: { id: number } } | undefined
  initializeOrigin(id: string, origin: { name: string; chain: { id: number; type: 'ethereum' } }): void
  setOriginFavicon(id: string, source: string): void
  touchOrigin(id: string): void
  switchOriginChain(id: string, chainId: number): void
  getPermission(address: Address, origin: string): Permission | undefined
  getKnownExtension(id: string): boolean | undefined
  clearKnownExtension(id: string): void
  subscribeKnownExtension(id: string, handler: (allowed: boolean) => void): () => void
  notifyExtension(extension: FrameExtension): void
}

interface AccountAccessPort {
  current(): { address: Address } | null | undefined
  /** Makes the account the app's selection so its prompts appear for the human. */
  select(address: Address): void
  routeRequest(requestSource: LocalApiSource, request: AccessRequest): void
}

interface ExtensionAccountPort {
  /** The account the extension acts as in the current profile. */
  account(extensionId: string): { address: Address } | null | undefined
  /** Asks the human which accounts the extension may see. */
  request(extensionId: string): Promise<unknown>
}

// Methods that create a prompt for the acting account.
const accountActionMethods = new Set([
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_addEthereumChain',
  'wallet_watchAsset'
])

export interface OriginsServiceDependencies {
  store: OriginStorePort
  accounts: AccountAccessPort
  extensions: ExtensionAccountPort
  requests: OriginRequestContinuationPort
  hasInternalStateCapability(requestSource: LocalApiSource): boolean
  development(): boolean
}

export function createOriginsService(dependencies: OriginsServiceDependencies) {
  const activeExtensionChecks = new Map<string, Promise<boolean>>()
  const activePermissionChecks = new Map<string, Promise<Address | undefined>>()

  const updateOrigin = (
    requestPayload: JSONRPCRequestPayload,
    origin: string,
    connectionMessage = false,
    faviconSource?: string
  ) => {
    const originId = uuidv5(origin, uuidv5.DNS)
    const existingOrigin = dependencies.store.getOrigin(originId)
    const result = projectOriginUpdate({
      payload: requestPayload,
      originId,
      existingChainId: existingOrigin?.chain?.id,
      connectionMessage
    })

    if (result.mutation?.type === 'initialize') {
      dependencies.store.initializeOrigin(originId, {
        name: origin,
        chain: { id: result.mutation.chainId, type: 'ethereum' }
      })
    } else if (result.mutation?.type === 'touch') {
      dependencies.store.touchOrigin(originId)
    }

    if (faviconSource) {
      dependencies.store.setOriginFavicon(originId, faviconSource)
    }
    return { payload: result.payload as RPCRequestPayload, chainId: result.chainId }
  }

  const parseFrameExtension = (req: IncomingMessage) =>
    parseExtensionIdentity({
      origin: req.headers.origin,
      requestUrl: req.url,
      development: dependencies.development()
    })

  /**
   * Browser code always sends a serialized Origin ("scheme://host" or "null"), and dapps must
   * reach Newframe through the extension, so the only browser connection admitted is the
   * extension's WebSocket. Local tools and workers may label themselves with a scheme-less origin.
   */
  const admitsConnection = (req: IncomingMessage, transport: 'http' | 'websocket') => {
    const origin = req.headers.origin
    const fromBrowser = origin === 'null' || Boolean(origin?.includes('://'))
    return !fromBrowser || (transport === 'websocket' && Boolean(parseFrameExtension(req)))
  }

  const requestExtensionPermission = (extension: FrameExtension) => {
    const activeCheck = activeExtensionChecks.get(extension.id)
    if (activeCheck) {
      return activeCheck
    }

    const result = new Promise<boolean>((resolve) => {
      const unsubscribe = dependencies.store.subscribeKnownExtension(extension.id, (isAllowed) => {
        if (!activeExtensionChecks.has(extension.id)) {
          return
        }
        activeExtensionChecks.delete(extension.id)
        unsubscribe()
        resolve(isAllowed)
      })
    })

    activeExtensionChecks.set(extension.id, result)
    dependencies.store.notifyExtension(extension)
    return result
  }

  const isKnownExtension = async (extension: FrameExtension, requestApproval = false) => {
    if (extension.browser === 'safari') {
      return true
    }

    const extensionPermission = dependencies.store.getKnownExtension(extension.id)
    if (extensionPermission === true) {
      return true
    }
    if (extensionPermission === false) {
      if (!requestApproval) {
        return false
      }
      dependencies.store.clearKnownExtension(extension.id)
    }
    return requestExtensionPermission(extension)
  }

  const requestPermission = (
    address: Address,
    fullPayload: RPCRequestPayload,
    requestSource: LocalApiSource
  ) => {
    const { _origin: originId, ...payload } = fullPayload
    const permissionCheckId = `${address}:${originId}`
    const activeCheck = activePermissionChecks.get(permissionCheckId)
    if (activeCheck) {
      return activeCheck
    }

    let resolveCheck!: (address: Address | undefined) => void
    let rejectCheck!: (error: unknown) => void
    const result = new Promise<Address | undefined>((resolve, reject) => {
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
      dependencies.requests.create((response) => {
        const grantedAddress =
          'result' in response && typeof response.result === 'string' ? response.result : undefined
        activePermissionChecks.delete(permissionCheckId)
        resolveCheck(grantedAddress)
      }, request.handlerId)
      dependencies.accounts.routeRequest(requestSource, request)
    } catch (error) {
      dependencies.requests.cancel(request.handlerId)
      activePermissionChecks.delete(permissionCheckId)
      rejectCheck(error)
    }
    return result
  }

  const hasAccountAccessGrant = async (payload: RPCRequestPayload, requestSource: LocalApiSource) => {
    const originName = dependencies.store.getOrigin(payload._origin)?.name ?? 'Unknown'
    // Dapps relayed by the extension act as the extension's account, not the app's selection.
    const extensionId = requestSource.participant === 'dapp' ? requestSource.extensionId : undefined
    const actingAccount = () =>
      extensionId ? dependencies.extensions.account(extensionId) : dependencies.accounts.current()
    let currentAccount = actingAccount()
    if (!currentAccount && extensionId && payload.method === 'eth_requestAccounts') {
      await dependencies.extensions.request(extensionId)
      currentAccount = actingAccount()
    }
    // A source may only act as its own account. Rejecting here, with the ordinary denial, keeps
    // requests naming another account from switching the app or revealing that account exists.
    const namedAccount = requestedAccount(payload.method, payload.params)
    if (namedAccount && namedAccount.toLowerCase() !== currentAccount?.address.toLowerCase()) {
      return false
    }
    const permission = currentAccount
      ? dependencies.store.getPermission(currentAccount.address, originName)
      : undefined
    const decision = decideOriginAuthorization({
      method: payload.method,
      originName,
      accountSelected: Boolean(currentAccount),
      providerPermission: permission?.provider,
      hasInternalStateCapability: dependencies.hasInternalStateCapability(requestSource)
    })

    if (decision === 'allow') {
      if (extensionId && currentAccount && accountActionMethods.has(payload.method)) {
        dependencies.accounts.select(currentAccount.address)
      }
      return true
    }
    if (decision === 'deny' || !currentAccount) {
      return false
    }

    if (extensionId) {
      dependencies.accounts.select(currentAccount.address)
    }
    const grantedAddress = await requestPermission(currentAccount.address, payload, requestSource).catch(
      () => undefined
    )
    if (!grantedAddress) {
      return false
    }
    const requiredAddress = ['eth_requestAccounts', 'eth_accounts'].includes(payload.method)
      ? actingAccount()?.address
      : currentAccount.address
    return Boolean(
      requiredAddress &&
      requiredAddress.toLowerCase() === grantedAddress.toLowerCase() &&
      dependencies.store.getPermission(grantedAddress, originName)?.provider
    )
  }

  return { admitsConnection, isKnownExtension, hasAccountAccessGrant, parseFrameExtension, updateOrigin }
}

export const parseOrigin = parseOriginName

export const parseRequestChainId = (req: IncomingMessage) => chainIdFromRequest(req.headers, req.url)

export function createProductionOriginsService(
  store: CanonicalStoreReader,
  accounts: Accounts,
  requests: OriginRequestContinuationPort
) {
  const productionStore: OriginStorePort = {
    getOrigin: (id) => store.getState().main.origins[id],
    initializeOrigin: (id, origin) => store.getState().initOrigin(id, origin),
    setOriginFavicon: (id, source) => store.getState().setOriginFavicon(id, source),
    touchOrigin: (id) => store.getState().addOriginRequest(id),
    switchOriginChain: (id, chainId) => store.getState().switchOriginChain(id, chainId, 'ethereum'),
    getPermission: (address, origin) => {
      const state = store.getState()
      const permissionsByAddress = state.main.permissions as Record<
        string,
        Record<string, Permission> | undefined
      >
      const permissions = permissionsByAddress[address] ?? {}
      return Object.values(permissions).find((permission) => permission.origin === origin)
    },
    getKnownExtension: (id) => store.getState().main.knownExtensions[id],
    clearKnownExtension: (id) => store.getState().trustExtension(id, undefined),
    subscribeKnownExtension: (id, handler) =>
      store.subscribe(
        (state) => state.main.knownExtensions[id],
        (allowed) => {
          if (typeof allowed !== 'undefined') {
            handler(allowed)
          }
        }
      ),
    notifyExtension: (extension) => store.getState().notify('extensionConnect', extension)
  }

  const extensionAccess = createExtensionAccessService(store)
  return createOriginsService({
    store: productionStore,
    accounts: {
      current: () => accounts.current(),
      select: (address) => {
        if (accounts.current()?.address !== address) {
          accounts.setSigner(address.toLowerCase(), (error) => {
            if (error) {
              log.error('Could not select the extension account', error)
            }
          })
        }
      },
      routeRequest: (requestSource, request) => accounts.routeRequest(requestSource, request)
    },
    extensions: {
      account: (extensionId) => {
        const accountId = activeExtensionAccountId(store.getState().main, extensionId)
        return accountId ? accounts.get(accountId) : undefined
      },
      request: (extensionId) => extensionAccess.request(extensionId)
    },
    requests,
    hasInternalStateCapability: (requestSource) =>
      hasSourceCapability(requestSource, 'wallet:internal-state'),
    development: () => process.env.NODE_ENV === 'development'
  })
}

export type OriginsService = ReturnType<typeof createOriginsService>
