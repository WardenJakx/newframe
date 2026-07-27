import { describe, expect, it } from 'bun:test'

import {
  chainIdFromRequest,
  decideOriginAuthorization,
  normalizeRequestChainId,
  parseExtensionIdentity,
  parseOriginName,
  projectOriginUpdate
} from './index'

function requestPayload(overrides: Partial<JSONRPCRequestPayload> = {}): JSONRPCRequestPayload {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_accounts',
    params: [],
    ...overrides
  }
}

describe('origin value rules', () => {
  it('normalizes transport origins without changing extension and symbolic identities', () => {
    const cases = [
      ['ws://frame.eth', 'frame.eth'],
      ['wss://rpc.frame.eth', 'rpc.frame.eth'],
      ['http://test-case.frame.io', 'test-case.frame.io'],
      ['https://www.google.com', 'www.google.com'],
      ['chrome-extension://extension-id', 'chrome-extension://extension-id'],
      ['newframe-extension', 'newframe-extension'],
      [undefined, 'Unknown']
    ] as const

    for (const [origin, expected] of cases) expect(parseOriginName(origin)).toBe(expected)
  })

  it('normalizes numeric chain-id representations while preserving invalid values for rejection', () => {
    const cases: Array<[unknown, string | undefined]> = [
      ['11155111', '0xaa36a7'],
      ['0xAA36A7', '0xaa36a7'],
      ['eip155:11155111', '0xaa36a7'],
      [31337, '0x7a69'],
      [['137'], '0x89'],
      ['sepolia', 'sepolia'],
      ['', undefined]
    ]

    for (const [chainId, expected] of cases) {
      expect(normalizeRequestChainId(chainId)).toBe(expected)
    }
  })

  it('routes chain ids with current-header, legacy-header, and URL precedence', () => {
    const cases = [
      [{ 'x-newframe-chain-id': '137', 'x-frame-chain-id': '1' }, '/?chainId=10', '0x89'],
      [{ 'x-frame-chain-id': '10' }, '/?chainId=137', '0xa'],
      [{}, '/?chainId=11155111', '0xaa36a7'],
      [{}, '/?chain=137', '0x89'],
      [{}, '/without-chain', undefined]
    ] as const

    for (const [headers, url, expected] of cases) {
      expect(chainIdFromRequest(headers, url)).toBe(expected)
    }
  })

  it('projects origin payload, chain selection, and its single required mutation cohesively', () => {
    const knownChains = new Set([1, 137])
    const basePayload = requestPayload()
    const newOrigin = projectOriginUpdate({
      payload: requestPayload({ chainId: '137' }),
      originId: 'origin-1',
      knownEthereumChainIds: knownChains,
      connectionMessage: false
    })
    const existingOrigin = projectOriginUpdate({
      payload: requestPayload({ chainId: '0x89' }),
      originId: 'origin-1',
      existingChainId: 1,
      knownEthereumChainIds: knownChains,
      connectionMessage: false
    })
    const unknownRequestedChain = projectOriginUpdate({
      payload: requestPayload({ chainId: '9999' }),
      originId: 'origin-1',
      existingChainId: 1,
      knownEthereumChainIds: knownChains,
      connectionMessage: false
    })
    const connection = projectOriginUpdate({
      payload: basePayload,
      originId: 'origin-1',
      existingChainId: 137,
      knownEthereumChainIds: knownChains,
      connectionMessage: true
    })

    expect({ newOrigin, existingOrigin, unknownRequestedChain, connection }).toStrictEqual({
      newOrigin: {
        payload: { ...basePayload, chainId: '0x89', _origin: 'origin-1' },
        chainId: '0x89',
        mutation: { type: 'initialize', chainId: 137 }
      },
      existingOrigin: {
        payload: { ...basePayload, chainId: '0x89', _origin: 'origin-1' },
        chainId: '0x89',
        mutation: { type: 'touch', switchToChainId: 137 }
      },
      unknownRequestedChain: {
        payload: { ...basePayload, chainId: '0x270f', _origin: 'origin-1' },
        chainId: '0x270f',
        mutation: { type: 'touch' }
      },
      connection: {
        payload: { ...basePayload, chainId: '0x89', _origin: 'origin-1' },
        chainId: '0x89',
        mutation: undefined
      }
    })
  })

  it('recognizes only browser identities allowed by environment and identity proof', () => {
    const cases = [
      [
        {
          origin: 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj',
          development: false
        },
        { browser: 'chrome', id: 'jdlcmcidcpckmaldjiacnbjeajgnmmgj' }
      ],
      [
        {
          origin: 'chrome-extension://dev-id',
          requestUrl: '/?identity=newframe-extension',
          development: true
        },
        { browser: 'chrome', id: 'dev-id' }
      ],
      [
        {
          origin: 'moz-extension://firefox-id',
          requestUrl: '/?identity=frame-extension',
          development: false
        },
        { browser: 'firefox', id: 'firefox-id' }
      ],
      [
        {
          origin: 'safari-web-extension://bundle-id',
          requestUrl: '/?identity=newframe-extension',
          development: true
        },
        { browser: 'safari', id: 'newframe-dev' }
      ],
      [
        {
          origin: 'safari-web-extension://bundle-id',
          requestUrl: '/?identity=newframe-extension',
          development: false
        },
        undefined
      ],
      [{ origin: 'moz-extension://firefox-id', development: false }, undefined],
      [
        {
          origin: 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf',
          development: false
        },
        undefined
      ]
    ] as const

    for (const [request, expected] of cases) {
      expect(parseExtensionIdentity(request)).toStrictEqual(expected)
    }
  })
})

describe('origin authorization rule', () => {
  it('keeps internal capability, origin validity, account selection, and permission decisions distinct', () => {
    const base = {
      method: 'eth_accounts',
      originName: 'wallet.example',
      accountSelected: true,
      hasInternalStateCapability: false
    }
    const cases = [
      [
        {
          ...base,
          method: 'wallet_getEthereumChains',
          originName: 'arbitrary-display-name',
          accountSelected: false,
          hasInternalStateCapability: true
        },
        'allow'
      ],
      [{ ...base, originName: '!invalid origin' }, 'deny'],
      [{ ...base, accountSelected: false }, 'deny'],
      [{ ...base, providerPermission: true }, 'allow'],
      [{ ...base, providerPermission: false }, 'deny'],
      [base, 'prompt']
    ] as const

    for (const [request, expected] of cases) {
      expect(decideOriginAuthorization(request)).toBe(expected)
    }
  })
})
