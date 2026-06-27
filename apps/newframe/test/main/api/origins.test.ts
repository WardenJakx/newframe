import { v5 as uuidv5 } from 'uuid'
import log from 'electron-log'

import store from '../../../main/store'

const accountsMock = { current: jest.fn(), addRequest: jest.fn() }

jest.mock('../../../main/accounts', () => ({ default: accountsMock, ...accountsMock }))

let accounts: any
let parseOrigin: any
let updateOrigin: any
let normalizeRequestChainId: any
let parseRequestChainId: any
let isTrusted: any
let parseFrameExtension: any
let isKnownExtension: any

beforeAll(async () => {
  log.transports.console.level = false

  accounts = (await import('../../../main/accounts')).default
  const originsModule = (await import('../../../main/api/origins')) as Record<string, any>
  parseOrigin = originsModule.parseOrigin
  updateOrigin = originsModule.updateOrigin
  normalizeRequestChainId = originsModule.normalizeRequestChainId
  parseRequestChainId = originsModule.parseRequestChainId
  isTrusted = originsModule.isTrusted
  parseFrameExtension = originsModule.parseFrameExtension
  isKnownExtension = originsModule.isKnownExtension
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  store.initOrigin = jest.fn()
  store.addOriginRequest = jest.fn()
  store.switchOriginChain = jest.fn()

  store.set('main.origins', {})
  store.set('main.permissions', {})
})

describe('#updateOrigin', () => {
  describe('handling origins', () => {
    it('adds a new origin to the store', () => {
      updateOrigin({}, 'frame.test')

      expect(store.initOrigin).toHaveBeenCalledWith(uuidv5('frame.test', uuidv5.DNS), {
        name: 'frame.test',
        chain: {
          type: 'ethereum',
          id: 1
        }
      })
    })

    it('does not overwrite an existing origin', () => {
      store.set('main.origins', uuidv5('frame.test', uuidv5.DNS), { chain: { id: 1 } })

      updateOrigin({}, 'frame.test')

      expect(store.initOrigin).not.toHaveBeenCalled()
    })

    it('does not initialize a new origin on a connection message', () => {
      updateOrigin({}, 'frame.test', true)

      expect(store.initOrigin).not.toHaveBeenCalled()
    })
    it('sets the payload chain id to mainnet for connection messages with no known origin', () => {
      const originalPayload = {}
      const { payload, chainId } = updateOrigin(originalPayload, 'frame.test', true)

      expect(chainId).toBe('0x1')
      expect(payload.chainId).toBe('0x1')
    })

    it('sets the payload chain id to the origin default for connection messages with a known origin', () => {
      const originalPayload = {}
      const { payload, chainId } = updateOrigin(originalPayload, 'frame.test', true)

      expect(chainId).toBe('0x1')
      expect(payload.chainId).toBe('0x1')
    })

    it('sets the chain id to mainnet for a new origin', () => {
      const { chainId } = updateOrigin({}, 'frame.test')

      expect(chainId).toBe('0x1')
    })

    it('sets the chain id to mainnet for an unknown origin', () => {
      const { chainId } = updateOrigin({}, 'Unknown')

      expect(chainId).toBe('0x1')
    })

    it('sets the chain id for an existing origin', () => {
      store.set('main.origins', uuidv5('frame.test', uuidv5.DNS), { chain: { id: 137 } })

      const { chainId } = updateOrigin({}, 'frame.test')

      expect(chainId).toBe('0x89')
    })

    it('does not override the chain id in the payload with one from a configured origin', () => {
      store.set('main.origins', uuidv5('frame.test', uuidv5.DNS), { chain: { id: 137 } })

      const { chainId } = updateOrigin({ chainId: '0x1' }, 'frame.test')

      expect(chainId).toBe('0x1')
    })

    it('normalizes the payload chain id when one is supplied', () => {
      const { payload, chainId } = updateOrigin({ chainId: '31337' }, 'frame.test')

      expect(chainId).toBe('0x7a69')
      expect(payload.chainId).toBe('0x7a69')
    })

    it('initializes a new origin on a known requested chain', () => {
      store.set('main.networks.ethereum', 137, { id: 137, type: 'ethereum', on: true })

      updateOrigin({ chainId: '0x89' }, 'frame.test')

      expect(store.initOrigin).toHaveBeenCalledWith(uuidv5('frame.test', uuidv5.DNS), {
        name: 'frame.test',
        chain: {
          type: 'ethereum',
          id: 137
        }
      })
    })

    it('switches an existing origin to a known requested chain', () => {
      const originId = uuidv5('frame.test', uuidv5.DNS)
      store.set('main.networks.ethereum', 137, { id: 137, type: 'ethereum', on: true })
      store.set('main.origins', originId, { chain: { id: 1, type: 'ethereum' } })

      updateOrigin({ chainId: '0x89' }, 'frame.test')

      expect(store.switchOriginChain).toHaveBeenCalledWith(originId, 137, 'ethereum')
    })

    it('does not switch an existing origin to an unknown requested chain', () => {
      const originId = uuidv5('frame.test', uuidv5.DNS)
      store.set('main.origins', originId, { chain: { id: 1, type: 'ethereum' } })

      const { chainId } = updateOrigin({ chainId: '0x270f' }, 'frame.test')

      expect(chainId).toBe('0x270f')
      expect(store.switchOriginChain).not.toHaveBeenCalled()
    })
  })

  describe('chain id routing', () => {
    it('normalizes decimal, hex, and CAIP-2 chain ids', () => {
      expect(normalizeRequestChainId('11155111')).toBe('0xaa36a7')
      expect(normalizeRequestChainId('0xAA36A7')).toBe('0xaa36a7')
      expect(normalizeRequestChainId('eip155:11155111')).toBe('0xaa36a7')
      expect(normalizeRequestChainId(31337)).toBe('0x7a69')
    })

    it('returns invalid chain ids unchanged so callers can reject them', () => {
      expect(normalizeRequestChainId('sepolia')).toBe('sepolia')
    })

    it('parses a chain id from request headers', () => {
      const req = {
        headers: { 'x-newframe-chain-id': '31337' },
        url: '/'
      }

      expect(parseRequestChainId(req as any)).toBe('0x7a69')
    })

    it('parses a decimal chain id from the request URL', () => {
      const req = {
        headers: {},
        url: '/?chainId=11155111'
      }

      expect(parseRequestChainId(req as any)).toBe('0xaa36a7')
    })
  })

  describe('parsing', () => {
    it('parses an origin using ws:// protocol', () => {
      const origin = parseOrigin('ws://frame.eth')

      expect(origin).toBe('frame.eth')
    })

    it('parses an origin using wss:// protocol', () => {
      const origin = parseOrigin('wss://rpc.frame.eth')

      expect(origin).toBe('rpc.frame.eth')
    })

    it('parses an origin using http:// protocol', () => {
      const origin = parseOrigin('http://test-case.frame.io')

      expect(origin).toBe('test-case.frame.io')
    })

    it('parses an origin using https:// protocol', () => {
      const origin = parseOrigin('https://www.google.com')

      expect(origin).toBe('www.google.com')
    })

    it('does not change an origin using an extension protocol', () => {
      const origin = parseOrigin('chrome-extension://tagxpelsfagzmzljsfgmuipalsfaohgpal')

      expect(origin).toBe('chrome-extension://tagxpelsfagzmzljsfgmuipalsfaohgpal')
    })

    it('does not change an origin with no prepended protocol', () => {
      const origin = parseOrigin('send.frame.eth')

      expect(origin).toBe('send.frame.eth')
    })

    it('does not change a plain string origin', () => {
      const origin = parseOrigin('newframe-extension')

      expect(origin).toBe('newframe-extension')
    })

    it('treats a lack of origin as unknown', () => {
      const origin = parseOrigin(undefined)

      expect(origin).toBe('Unknown')
    })
  })
})

describe('#parseFrameExtension', () => {
  it('does not recognize the old Chrome Web Store extension', () => {
    const origin = 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf'
    const req = { headers: { origin } }

    expect(parseFrameExtension(req as any)).toBeUndefined()
  })

  it('correctly identifies the local unpacked Chrome extension', () => {
    const origin = 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj'
    const req = { headers: { origin } }

    expect(parseFrameExtension(req as any)).toStrictEqual({
      browser: 'chrome',
      id: 'jdlcmcidcpckmaldjiacnbjeajgnmmgj'
    })
  })

  it('does not recognize a Chrome extension with the wrong id', () => {
    const origin = 'chrome-extension://somebogusid'
    const req = { headers: { origin } }

    expect(parseFrameExtension(req as any)).toBeUndefined()
  })

  it('correctly identifies the Firefox extension', () => {
    const origin = 'moz-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
    const req = { headers: { origin }, url: '/?identity=newframe-extension' }

    expect(parseFrameExtension(req as any)).toStrictEqual({
      browser: 'firefox',
      id: '4be0643f-1d98-573b-97cd-ca98a65347dd'
    })
  })

  it('does not recognize the Firefox extension without the identity query parameter', () => {
    const origin = 'moz-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
    const req = { headers: { origin }, url: '/' }

    expect(parseFrameExtension(req as any)).toBeUndefined()
  })

  it('correctly identifies the Safari extension', async () => {
    return withEnvironment({ NODE_ENV: 'development' }, async () => {
      const origin = 'safari-web-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
      const req = { headers: { origin }, url: '/?identity=newframe-extension' }

      const { parseFrameExtension } = await import('../../../main/api/origins')

      expect(parseFrameExtension(req as any)).toStrictEqual({
        browser: 'safari',
        id: expect.any(String)
      })
    })
  })

  it('does not recognize a Safari extension in production', () => {
    return withEnvironment({ NODE_ENV: 'production' }, async () => {
      const origin = 'safari-web-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
      const req = { headers: { origin }, url: '/?identity=newframe-extension' }

      const { parseFrameExtension } = await import('../../../main/api/origins')

      expect(parseFrameExtension(req as any)).toBeUndefined()
    })
  })

  it('does not recognize the Safari extension without the identity query parameter', () => {
    return withEnvironment({ NODE_ENV: 'development' }, async () => {
      const origin = 'safari-web-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
      const req = { headers: { origin }, url: '/' }

      const { parseFrameExtension } = await import('../../../main/api/origins')

      expect(parseFrameExtension(req as any)).toBeUndefined()
    })
  })

  it('does not recognize an extension from an unsupported browser', () => {
    const origin = 'brave-extension://4be0643f-1d98-573b-97cd-ca98a65347dd'
    const req = { headers: { origin } }

    expect(parseFrameExtension(req as any)).toBeUndefined()
  })
})

describe('#isKnownExtension', () => {
  beforeEach(() => {
    store.set('main.knownExtensions', {})
    store.notify = jest.fn()
  })

  it('always knows a recognized Chrome extension', async () => {
    const extension = { browser: 'chrome', id: 'jdlcmcidcpckmaldjiacnbjeajgnmmgj' }
    return expect(isKnownExtension(extension)).resolves.toBe(true)
  })

  it('always knows the single Safari extension', async () => {
    const extension = { browser: 'safari', id: 'test-frame' }
    return expect(isKnownExtension(extension)).resolves.toBe(true)
  })

  it('knows a previously trusted Firefox extension', async () => {
    const extension = { browser: 'firefox', id: '4be0643f-1d98-573b-97cd-ca98a65347dd' }

    store.set('main.knownExtensions', { [extension.id]: true })

    return expect(isKnownExtension(extension)).resolves.toBe(true)
  })

  it('rejects a previously rejected Firefox extension', async () => {
    const extension = { browser: 'firefox', id: '4be0643f-1d98-573b-97cd-ca98a65347dd' }

    store.set('main.knownExtensions', { [extension.id]: false })

    return expect(isKnownExtension(extension)).resolves.toBe(false)
  })

  it('prompts the user to trust a Firefox extension', async () => {
    const extension = { browser: 'firefox', id: '4be0643f-1d98-573b-97cd-ca98a65347dd' }

    isKnownExtension(extension)

    expect(store.notify).toHaveBeenCalledWith('extensionConnect', extension)
  })

  it('allows a user to trust a Firefox extension', async () => {
    const extension = { browser: 'firefox', id: '4ae0643f-1d98-573b-97cd-ca98a65347dd' }

    ;(store.notify as any).mockImplementationOnce(() => {
      // simulate user accepting the request
      store.set('main.knownExtensions', { [extension.id]: true })
      ;(store.getObserver('origins:requestExtension') as any).fire()
    })

    return expect(isKnownExtension(extension)).resolves.toBe(true)
  })

  it('allows a user to reject a connection from a Firefox extension', async () => {
    const extension = { browser: 'firefox', id: '4ce0643f-1d98-573b-97cd-ca98a65347dd' }

    ;(store.notify as any).mockImplementationOnce(() => {
      // simulate user accepting the request
      store.set('main.knownExtensions', { [extension.id]: false })
      ;(store.getObserver('origins:requestExtension') as any).fire()
    })

    return expect(isKnownExtension(extension)).resolves.toBe(false)
  })
})

describe('#isTrusted', () => {
  const frameTestOriginId = 'bf93061b-3575-40c5-b526-4932b02e1f3f'

  beforeEach(() => {
    store.set('main.origins', frameTestOriginId, { name: 'test.frame.eth' })
    store.set('main.permissions', {})
  })

  describe('extension requests', () => {
    // these origins are "trusted" internally and thus have access to specific methods without approval
    const trustedOrigins = ['newframe-extension', 'newframe-internal', 'frame-extension', 'frame-internal']
    const trustedExtensionMethods = ['wallet_getEthereumChains']

    trustedOrigins.forEach((origin) => {
      it(`does not trust requests from the ${origin} origin by default`, async () => {
        const payload = { method: 'eth_accounts', _origin: 'ac93061b-3575-40c5-b526-4932b02e1f3f' }
        store.set('main.origins', payload._origin, { name: origin })

        return expect(isTrusted(payload)).resolves.toBe(false)
      })

      trustedExtensionMethods.forEach((method) => {
        it(`trusts all requests for ${method} from the ${origin} origin`, async () => {
          const payload = { method, _origin: 'ac93061b-3575-40c5-b526-4932b02e1f3f' }
          store.set('main.origins', payload._origin, { name: origin })

          return expect(isTrusted(payload)).resolves.toBe(true)
        })
      })
    })
  })

  it('does not trust any request with an invalid origin', async () => {
    const payload = { _origin: 'ac93061b-3575-40c5-b526-4932b02e1f3f' }
    store.set('main.origins', payload._origin, { name: '!nvalid origin' })

    return expect(isTrusted(payload)).resolves.toBe(false)
  })

  it('does not trust a request if no account is selected', async () => {
    const payload = { _origin: frameTestOriginId }

    ;(accounts.current as any).mockReturnValueOnce(undefined)

    return expect(isTrusted(payload)).resolves.toBe(false)
  })

  it('trusts an origin that has been previously granted permission', async () => {
    const address = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'
    const payload = { method: 'eth_accounts', _origin: frameTestOriginId }

    ;(accounts.current as any).mockReturnValueOnce({ address })

    store.set('main.permissions', address, {
      'c004cc87-bfa3-50f5-812f-3d70dd8f82c6': {
        origin: 'test.frame.eth',
        provider: true
      }
    })

    return expect(isTrusted(payload)).resolves.toBe(true)
  })

  it('sends a request to grant permission to the user', async () => {
    const address = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'
    const payload = { method: 'eth_accounts', _origin: frameTestOriginId }

    ;(accounts.current as any).mockReturnValueOnce({ address })
    ;(accounts.addRequest as any).mockImplementationOnce((request: any, cb: any) => {
      expect(request).toStrictEqual({
        type: 'access',
        handlerId: frameTestOriginId,
        origin: frameTestOriginId,
        account: address,
        payload: {
          method: 'eth_accounts'
        }
      })

      setTimeout(cb, 1000)
    })

    const runTest = isTrusted(payload)

    jest.runAllTimers()

    return expect(runTest).resolves
  })

  it('sends a response to all permission requests once the user trusts the origin', async () => {
    const address = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'
    const payload1 = { method: 'wallet_getEthereumAccounts', _origin: frameTestOriginId }
    const payload2 = { method: 'eth_accounts', _origin: frameTestOriginId }

    ;(accounts.current as any).mockReturnValue({ address })
    ;(accounts.addRequest as any).mockImplementationOnce((request: any, cb: any) => {
      setTimeout(() => {
        // simulate user accepting the request after both RPC requests are received
        store.set('main.permissions', address, {
          [frameTestOriginId]: {
            origin: 'test.frame.eth',
            provider: true
          }
        })

        cb()
      }, 1000)
    })

    const runTest = Promise.all([isTrusted(payload1), isTrusted(payload2)]).then(
      ([isPayload1Trusted, isPayload2Trusted]) => {
        expect(accounts.addRequest).toHaveBeenCalledTimes(1)
        expect(isPayload1Trusted).toBe(true)
        expect(isPayload2Trusted).toBe(true)
      }
    )

    jest.runAllTimers()

    return runTest
  })

  const userActions = [
    { actionTaken: 'accepted', outcome: 'grants' },
    { actionTaken: 'declined', outcome: 'refuses' }
  ]

  userActions.forEach(({ actionTaken, outcome }) => {
    it(`${outcome} permission after a request is ${actionTaken} by the user`, async () => {
      const permissionGranted = actionTaken === 'grants'
      const address = '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5'
      const payload = { method: 'eth_accounts', _origin: 'bf93061b-3575-40c5-b526-4932b02e1f3f' }

      ;(accounts.current as any).mockReturnValueOnce({ address })

      // simulate user acting on request
      ;(accounts.addRequest as any).mockImplementationOnce((request: any, cb: any) => {
        setTimeout(() => {
          store.set('main.permissions', address, {
            'c004cc87-bfa3-50f5-812f-3d70dd8f82c6': {
              origin: 'test.frame.eth',
              provider: permissionGranted
            }
          })

          cb()
        }, 1000)
      })

      const runTest = isTrusted(payload)

      jest.runAllTimers()

      return expect(runTest).resolves.toBe(permissionGranted)
    })
  })
})

// helper functions
async function withEnvironment(env: any, test: any) {
  const oldEnv = { ...process.env }

  Object.keys(process.env).forEach((key) => {
    if (!(key in env)) delete process.env[key]
  })
  Object.assign(process.env, env)

  await test()

  Object.keys(process.env).forEach((key) => {
    if (!(key in oldEnv)) delete process.env[key]
  })
  Object.assign(process.env, oldEnv)
}
