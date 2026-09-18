import { describe, expect, it } from 'bun:test'

import { v5 as uuidv5 } from 'uuid'

import type { Permission } from '../../../platform/state-store/state'
import { createRpcPrincipal } from '../../access-control/main/authority'
import type { AccessRequest } from '../../requests/contract/requests'
import { createOriginsService, type FrameExtension, type OriginsServiceDependencies } from './origins'

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

type StoredOrigin = {
  name: string
  chain?: { id: number; type?: string }
  touches?: number
  faviconSource?: string
}

function createOriginHarness() {
  const origins: Record<string, StoredOrigin> = {}
  const permissions: Record<string, Permission[]> = {}
  const knownExtensions: Record<string, boolean> = {}
  const extensionListeners = new Map<string, Set<(allowed: boolean) => void>>()
  const notifications: FrameExtension[] = []
  const routedRequests: Array<{
    principal: typeof principal
    request: AccessRequest
  }> = []
  const continuations = new Map<string, RPCRequestCallback>()
  const knownEthereumChainIds = new Set([1])
  let currentAccount: { address: Address } | undefined = { address }
  let development = false
  let routeHandler:
    | ((request: AccessRequest, complete: (grantedAddress?: Address) => void) => void)
    | undefined

  const dependencies: OriginsServiceDependencies = {
    store: {
      getOrigin: (id) => origins[id],
      getKnownEthereumChainIds: () => knownEthereumChainIds,
      initializeOrigin: (id, origin) => {
        origins[id] = origin
      },
      setOriginFavicon: (id, source) => {
        origins[id].faviconSource = source
      },
      touchOrigin: (id) => {
        origins[id].touches = (origins[id].touches ?? 0) + 1
      },
      switchOriginChain: (id, chainId) => {
        origins[id].chain = { id: chainId, type: 'ethereum' }
      },
      getPermission: (accountAddress, origin) =>
        permissions[accountAddress]?.find((permission) => permission.origin === origin),
      getKnownExtension: (id) => knownExtensions[id],
      clearKnownExtension: (id) => {
        delete knownExtensions[id]
      },
      subscribeKnownExtension: (id, handler) => {
        const listeners = extensionListeners.get(id) ?? new Set()
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
      routeRequest: (receivedPrincipal, request) => {
        routedRequests.push({
          principal: receivedPrincipal,
          request
        })
        const complete = (grantedAddress: Address = request.account) => {
          const continuation = continuations.get(request.handlerId)
          continuations.delete(request.handlerId)
          continuation?.({
            id: request.payload.id,
            jsonrpc: request.payload.jsonrpc,
            result: grantedAddress
          })
        }
        routeHandler?.(request, complete)
      }
    },
    requests: {
      cancel: (requestId) => continuations.delete(requestId),
      create: (respond, requestId = 'generated-request') => {
        continuations.set(requestId, respond)
        return requestId
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
    respond(requestId: string, response: RPCResponsePayload) {
      const continuation = continuations.get(requestId)
      continuations.delete(requestId)
      continuation?.(response)
    },
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
    setPermission(origin: string, provider: boolean, accountAddress: Address = address) {
      permissions[accountAddress] = [{ origin, provider, handlerId: uuidv5(origin, uuidv5.DNS) }]
    },
    setKnownExtension(id: string, allowed: boolean) {
      knownExtensions[id] = allowed
      for (const listener of extensionListeners.get(id) ?? []) {
        listener(allowed)
      }
    },
    onRoute(handler: (request: AccessRequest, complete: (grantedAddress?: Address) => void) => void) {
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
  it('reopens a declined connection only on explicit retry and shares the new decision', async () => {
    const harness = createOriginHarness()
    const extension: FrameExtension = { browser: 'firefox', id: 'retry-firefox' }
    harness.setKnownExtension(extension.id, false)

    expect(harness.service.isKnownExtension(extension)).resolves.toBe(false)
    expect(harness.notifications).toHaveLength(0)

    for (const allowed of [false, true]) {
      const retry = harness.service.isKnownExtension(extension, true)
      const concurrent = harness.service.isKnownExtension(extension)
      harness.setKnownExtension(extension.id, allowed)
      expect(Promise.all([retry, concurrent])).resolves.toEqual([allowed, allowed])
    }
    expect(harness.notifications).toEqual([extension, extension])
  })

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

  it('allows Safari and honors cached Chrome and Firefox decisions', async () => {
    const harness = createOriginHarness()
    harness.setKnownExtension('trusted-chrome', true)
    harness.setKnownExtension('rejected-chrome', false)
    harness.setKnownExtension('trusted-firefox', true)
    harness.setKnownExtension('rejected-firefox', false)

    const results = await Promise.all([
      harness.service.isKnownExtension({ browser: 'chrome', id: 'trusted-chrome' }),
      harness.service.isKnownExtension({ browser: 'chrome', id: 'rejected-chrome' }),
      harness.service.isKnownExtension({ browser: 'safari', id: 'safari' }),
      harness.service.isKnownExtension({ browser: 'firefox', id: 'trusted-firefox' }),
      harness.service.isKnownExtension({ browser: 'firefox', id: 'rejected-firefox' })
    ])

    expect(results).toStrictEqual([true, false, true, true, false])
    expect(harness.notifications).toStrictEqual([])
  })

  it.each(['chrome', 'firefox'] as const)(
    'prompts once for concurrent %s checks and resolves every waiter with the decision',
    async (browser) => {
      for (const allowed of [true, false]) {
        const harness = createOriginHarness()
        const extension: FrameExtension = { browser, id: `${browser}-${allowed}` }

        const first = harness.service.isKnownExtension(extension)
        const second = harness.service.isKnownExtension(extension)

        expect(harness.notifications).toStrictEqual([extension])
        harness.setKnownExtension(extension.id, allowed)
        expect(Promise.all([first, second])).resolves.toStrictEqual([allowed, allowed])
      }
    }
  )
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

    expect(harness.service.isTrusted(payload, principal)).resolves.toBe(false)
    expect(harness.service.isTrusted(payload, internalPrincipal)).resolves.toBe(true)
    expect(harness.service.isTrusted(requestPayload({ _origin: originId }), internalPrincipal)).resolves.toBe(
      false
    )
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

  it('denies passive account lookup without prompting or accepting another account grant', async () => {
    const ungrantedHarness = createOriginHarness()
    ungrantedHarness.setOrigin(originId, { name: 'test.frame.eth' })
    const otherAccountHarness = createOriginHarness()
    otherAccountHarness.setOrigin(originId, { name: 'test.frame.eth' })
    otherAccountHarness.setPermission('test.frame.eth', true, '0x0000000000000000000000000000000000000002')

    const results = await Promise.all([
      ungrantedHarness.service.isTrusted(requestPayload({ _origin: originId }), principal),
      otherAccountHarness.service.isTrusted(requestPayload({ _origin: originId }), principal)
    ])

    expect(results).toStrictEqual([false, false])
    expect([ungrantedHarness.routedRequests.length, otherAccountHarness.routedRequests.length]).toEqual([
      0, 0
    ])
  })

  it('routes one canonical access request and returns the user permission outcome', async () => {
    for (const provider of [true, false]) {
      const harness = createOriginHarness()
      harness.setOrigin(originId, { name: 'test.frame.eth' })
      harness.onRoute((_request, complete) => {
        harness.setPermission('test.frame.eth', provider)
        complete()
      })

      const result = await harness.service.isTrusted(
        requestPayload({ method: 'eth_requestAccounts', _origin: originId }),
        principal
      )

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
                method: 'eth_requestAccounts',
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
      requestPayload({ method: 'personal_sign', _origin: originId }),
      principal
    )
    const second = harness.service.isTrusted(
      requestPayload({ method: 'eth_requestAccounts', _origin: originId }),
      principal
    )

    expect(harness.routedRequests).toHaveLength(1)
    harness.setPermission('test.frame.eth', true)
    completions[0]()

    expect(Promise.all([first, second])).resolves.toStrictEqual([true, true])
  })
})

for (const firstMethod of ['eth_requestAccounts', 'personal_sign']) {
  it(`checks each mixed permission waiter after ${firstMethod} opens the shared prompt`, async () => {
    const harness = createOriginHarness()
    const originId = uuidv5('test.frame.eth', uuidv5.DNS)
    const other = '0x0000000000000000000000000000000000000002'
    let complete!: (grantedAddress?: Address) => void
    harness.setOrigin(originId, { name: 'test.frame.eth' })
    harness.onRoute((_request, done) => {
      complete = done
    })
    const methods = [
      firstMethod,
      firstMethod === 'eth_requestAccounts' ? 'personal_sign' : 'eth_requestAccounts',
      'eth_accounts'
    ]
    const pending = methods.map((method) =>
      harness.service.isTrusted(requestPayload({ method, _origin: originId }), principal)
    )
    expect(harness.routedRequests).toHaveLength(1)
    // Only a connect-owned prompt permits choosing the global account.
    const granted = firstMethod === 'eth_requestAccounts' ? other : address
    harness.setAccount(other)
    harness.setPermission('test.frame.eth', true, granted)
    complete(granted)
    expect(await Promise.all(pending)).toEqual(
      methods.map((method) => {
        if (method === 'eth_accounts') {
          return false
        }
        return method === 'personal_sign' ? granted === address : granted === other
      })
    )
  })
}

it('denies a discovery waiter if selected account changes again or the returned grant is absent', async () => {
  for (const permissionPresent of [true, false]) {
    const harness = createOriginHarness()
    const originId = uuidv5('test.frame.eth', uuidv5.DNS)
    let complete!: (grantedAddress?: Address) => void
    harness.setOrigin(originId, { name: 'test.frame.eth' })
    harness.onRoute((_request, done) => {
      complete = done
    })
    const result = harness.service.isTrusted(
      requestPayload({ method: 'eth_requestAccounts', _origin: originId }),
      principal
    )
    if (permissionPresent) {
      harness.setPermission('test.frame.eth', true)
      harness.setAccount()
    }
    complete(address)
    expect(result).resolves.toBe(false)
  }
})

it.each([false, true])(
  'denies explicit permission rejection even if a grant appears concurrently, error=%s',
  async (error) => {
    const harness = createOriginHarness()
    const originId = uuidv5('test.frame.eth', uuidv5.DNS)
    harness.setOrigin(originId, { name: 'test.frame.eth' })
    const result = harness.service.isTrusted(
      requestPayload({ method: 'eth_requestAccounts', _origin: originId }),
      principal
    )
    harness.setPermission('test.frame.eth', true)
    harness.respond(
      originId,
      error
        ? { id: 1, jsonrpc: '2.0', error: { code: 4001, message: 'Denied' } }
        : { id: 1, jsonrpc: '2.0', result: undefined }
    )
    expect(result).resolves.toBe(false)
  }
)
