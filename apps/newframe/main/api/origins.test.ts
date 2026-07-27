import { describe, expect, it } from 'bun:test'
import { v5 as uuidv5 } from 'uuid'

import { createRpcPrincipal } from '../authority'
import { createOriginsService, type FrameExtension, type OriginsServiceDependencies } from './origins'

import type { AccessRequest } from '../../contracts/requests'
import type { Permission } from '../store/state'

const address = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'
const principal = createRpcPrincipal({
  transport: 'http',
  connectionId: 'origin-test',
  origin: 'test.frame.eth'
})
const internalPrincipal = createRpcPrincipal({
  transport: 'websocket',
  connectionId: 'companion-test',
  origin: 'newframe-extension',
  capabilities: ['wallet:internal-state']
})

function requestPayload(overrides: Partial<RPCRequestPayload> = {}): RPCRequestPayload {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_accounts',
    params: [],
    _origin: '',
    ...overrides
  }
}

type StoredOrigin = { name: string; chain?: { id: number; type?: string }; touches?: number }

function createOriginHarness() {
  const origins: Record<string, StoredOrigin> = {}
  const permissions: Record<string, Permission[]> = {}
  const knownExtensions: Record<string, boolean> = {}
  const extensionListeners = new Map<string, Set<(allowed: boolean) => void>>()
  const notifications: FrameExtension[] = []
  const routedRequests: Array<{
    principal: typeof principal
    request: AccessRequest
    complete: () => void
  }> = []
  const knownEthereumChainIds = new Set([1])
  let currentAccount: { address: Address } | undefined = { address }
  let development = false
  let routeHandler: ((request: AccessRequest, complete: () => void) => void) | undefined

  const dependencies: OriginsServiceDependencies = {
    store: {
      getOrigin: (id) => origins[id],
      getKnownEthereumChainIds: () => knownEthereumChainIds,
      initializeOrigin: (id, origin) => {
        origins[id] = origin
      },
      touchOrigin: (id) => {
        origins[id].touches = (origins[id].touches || 0) + 1
      },
      switchOriginChain: (id, chainId) => {
        origins[id].chain = { id: chainId, type: 'ethereum' }
      },
      getPermission: (accountAddress, origin) =>
        permissions[accountAddress]?.find((permission) => permission.origin === origin),
      getKnownExtension: (id) => knownExtensions[id],
      subscribeKnownExtension: (id, handler) => {
        const listeners = extensionListeners.get(id) || new Set()
        listeners.add(handler)
        extensionListeners.set(id, listeners)
        return () => listeners.delete(handler)
      },
      notifyExtension: (extension) => {
        notifications.push(extension)
      }
    },
    accounts: {
      current: () => currentAccount,
      routeRequest: (receivedPrincipal, request, complete) => {
        routedRequests.push({
          principal: receivedPrincipal as typeof principal,
          request,
          complete
        })
        routeHandler?.(request, complete)
      }
    },
    hasInternalStateCapability: (receivedPrincipal) => receivedPrincipal === internalPrincipal,
    development: () => development
  }

  return {
    service: createOriginsService(dependencies),
    origins,
    notifications,
    routedRequests,
    knownEthereumChainIds,
    setAccount(next?: Address) {
      currentAccount = next ? { address: next } : undefined
    },
    setDevelopment(value: boolean) {
      development = value
    },
    setOrigin(id: string, origin: StoredOrigin) {
      origins[id] = origin
    },
    setPermission(origin: string, provider: boolean) {
      permissions[address] = [{ origin, provider, handlerId: uuidv5(origin, uuidv5.DNS) }]
    },
    setKnownExtension(id: string, allowed: boolean) {
      knownExtensions[id] = allowed
      for (const listener of extensionListeners.get(id) || []) listener(allowed)
    },
    onRoute(handler: (request: AccessRequest, complete: () => void) => void) {
      routeHandler = handler
    }
  }
}

describe('origin update service', () => {
  it('initializes a new known-chain origin with its complete projected result', () => {
    const harness = createOriginHarness()
    harness.knownEthereumChainIds.add(137)
    const originId = uuidv5('frame.test', uuidv5.DNS)

    const input = requestPayload({ chainId: '137' })
    const result = harness.service.updateOrigin(input, 'frame.test')

    expect({ result, storedOrigin: harness.origins[originId] } as unknown).toStrictEqual({
      result: {
        payload: { ...input, chainId: '0x89', _origin: originId },
        chainId: '0x89'
      },
      storedOrigin: {
        name: 'frame.test',
        chain: { id: 137, type: 'ethereum' }
      }
    })
  })

  it('touches an existing origin and switches only to a configured requested chain', () => {
    const harness = createOriginHarness()
    const originId = uuidv5('frame.test', uuidv5.DNS)
    harness.knownEthereumChainIds.add(137)
    harness.setOrigin(originId, {
      name: 'frame.test',
      chain: { id: 1, type: 'ethereum' }
    })

    const knownInput = requestPayload({ chainId: '0x89' })
    const unknownInput = requestPayload({ chainId: '9999' })
    const knownResult = harness.service.updateOrigin(knownInput, 'frame.test')
    const unknownResult = harness.service.updateOrigin(unknownInput, 'frame.test')

    expect({
      knownResult,
      unknownResult,
      storedOrigin: harness.origins[originId]
    }).toStrictEqual({
      knownResult: {
        payload: { ...knownInput, _origin: originId },
        chainId: '0x89'
      },
      unknownResult: {
        payload: { ...unknownInput, chainId: '0x270f', _origin: originId },
        chainId: '0x270f'
      },
      storedOrigin: {
        name: 'frame.test',
        chain: { id: 137, type: 'ethereum' },
        touches: 2
      }
    })
  })

  it('projects connection messages without mutating origin state', () => {
    const harness = createOriginHarness()
    const originId = uuidv5('frame.test', uuidv5.DNS)

    const input = requestPayload()
    const result = harness.service.updateOrigin(input, 'frame.test', true)

    expect({ result, storedOrigin: harness.origins[originId] } as unknown).toStrictEqual({
      result: {
        payload: { ...input, chainId: '0x1', _origin: originId },
        chainId: '0x1'
      },
      storedOrigin: undefined
    })
  })
})

describe('extension trust service', () => {
  it('recognizes production and development extension identities through the injected environment', () => {
    const harness = createOriginHarness()
    const safariRequest = {
      headers: { origin: 'safari-web-extension://bundle-id' },
      url: '/?identity=newframe-extension'
    }

    expect(
      harness.service.parseFrameExtension({
        headers: { origin: 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj' }
      } as never)
    ).toStrictEqual({
      browser: 'chrome',
      id: 'jdlcmcidcpckmaldjiacnbjeajgnmmgj'
    })
    expect(harness.service.parseFrameExtension(safariRequest as never)).toBeUndefined()

    harness.setDevelopment(true)
    expect(harness.service.parseFrameExtension(safariRequest as never)).toStrictEqual({
      browser: 'safari',
      id: 'newframe-dev'
    })
  })

  it('allows platform-trusted extensions and honors cached Firefox decisions', async () => {
    const harness = createOriginHarness()
    harness.setKnownExtension('trusted-firefox', true)
    harness.setKnownExtension('rejected-firefox', false)

    const results = await Promise.all([
      harness.service.isKnownExtension({ browser: 'chrome', id: 'chrome' }),
      harness.service.isKnownExtension({ browser: 'safari', id: 'safari' }),
      harness.service.isKnownExtension({ browser: 'firefox', id: 'trusted-firefox' }),
      harness.service.isKnownExtension({ browser: 'firefox', id: 'rejected-firefox' })
    ])

    expect(results).toStrictEqual([true, true, true, false])
    expect(harness.notifications).toStrictEqual([])
  })

  it('prompts once for concurrent Firefox checks and resolves every waiter with the decision', async () => {
    for (const allowed of [true, false]) {
      const harness = createOriginHarness()
      const extension: FrameExtension = { browser: 'firefox', id: `firefox-${allowed}` }

      const first = harness.service.isKnownExtension(extension)
      const second = harness.service.isKnownExtension(extension)

      expect(harness.notifications).toStrictEqual([extension])
      harness.setKnownExtension(extension.id, allowed)
      await expect(Promise.all([first, second])).resolves.toStrictEqual([allowed, allowed])
    }
  })
})

describe('origin authorization service', () => {
  const originId = uuidv5('test.frame.eth', uuidv5.DNS)

  it('grants the internal chain query only from a capable principal', async () => {
    const harness = createOriginHarness()
    harness.setAccount()
    harness.setOrigin(originId, { name: 'newframe-extension' })
    const payload = requestPayload({
      method: 'wallet_getEthereumChains',
      _origin: originId
    })

    await expect(harness.service.isTrusted(payload, principal)).resolves.toBe(false)
    await expect(harness.service.isTrusted(payload, internalPrincipal)).resolves.toBe(true)
    await expect(
      harness.service.isTrusted(requestPayload({ _origin: originId }), internalPrincipal)
    ).resolves.toBe(false)
    expect(harness.routedRequests).toHaveLength(0)
  })

  it('denies invalid origins and missing accounts without opening a permission prompt', async () => {
    const invalidHarness = createOriginHarness()
    invalidHarness.setOrigin(originId, { name: '!nvalid origin' })
    const missingAccountHarness = createOriginHarness()
    missingAccountHarness.setOrigin(originId, { name: 'test.frame.eth' })
    missingAccountHarness.setAccount()

    const results = await Promise.all([
      invalidHarness.service.isTrusted(requestPayload({ _origin: originId }), principal),
      missingAccountHarness.service.isTrusted(requestPayload({ _origin: originId }), principal)
    ])

    expect(results).toStrictEqual([false, false])
    expect([invalidHarness.routedRequests.length, missingAccountHarness.routedRequests.length]).toStrictEqual(
      [0, 0]
    )
  })

  it('honors existing provider grants and denials without prompting', async () => {
    const results = []

    for (const provider of [true, false]) {
      const harness = createOriginHarness()
      harness.setOrigin(originId, { name: 'test.frame.eth' })
      harness.setPermission('test.frame.eth', provider)
      results.push(await harness.service.isTrusted(requestPayload({ _origin: originId }), principal))
      expect(harness.routedRequests).toHaveLength(0)
    }

    expect(results).toStrictEqual([true, false])
  })

  it('routes one canonical access request and returns the user permission outcome', async () => {
    for (const provider of [true, false]) {
      const harness = createOriginHarness()
      harness.setOrigin(originId, { name: 'test.frame.eth' })
      harness.onRoute((_request, complete) => {
        harness.setPermission('test.frame.eth', provider)
        complete()
      })

      const result = await harness.service.isTrusted(requestPayload({ _origin: originId }), principal)

      expect({
        result,
        routed: harness.routedRequests.map(({ principal: routedPrincipal, request }) => ({
          principal: routedPrincipal,
          request
        }))
      }).toStrictEqual({
        result: provider,
        routed: [
          {
            principal,
            request: {
              type: 'access',
              handlerId: originId,
              origin: originId,
              account: address,
              payload: {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_accounts',
                params: []
              }
            }
          }
        ]
      })
    }
  })

  it('deduplicates concurrent permission prompts and resolves all callers from the final grant', async () => {
    const harness = createOriginHarness()
    const completions: Array<() => void> = []
    harness.setOrigin(originId, { name: 'test.frame.eth' })
    harness.onRoute((_request, complete) => completions.push(complete))

    const first = harness.service.isTrusted(
      requestPayload({ method: 'wallet_getEthereumAccounts', _origin: originId }),
      principal
    )
    const second = harness.service.isTrusted(requestPayload({ _origin: originId }), principal)

    expect(harness.routedRequests).toHaveLength(1)
    harness.setPermission('test.frame.eth', true)
    completions[0]()

    await expect(Promise.all([first, second])).resolves.toStrictEqual([true, true])
  })
})
