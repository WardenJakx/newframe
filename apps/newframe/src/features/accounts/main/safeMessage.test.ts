import { expect, it, mock } from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { Wallet } from 'ethers'

import { getOriginalMessageDigest } from '../../../platform/signing/signatures/digests'
import type { SignatureRequest, TypedMessage } from '../../requests/contract/requests'
import { createSafeMessageService, type SafeMessagePorts } from './safeMessage'

const safe = '0x1111111111111111111111111111111111111111'

function fixture(options: { threshold?: number; ownerCount?: number; version?: SignTypedDataVersion } = {}) {
  const wallets = [Wallet.createRandom(), Wallet.createRandom()]
  const ownerCount = options.ownerCount ?? 2
  const owners = wallets.slice(0, ownerCount)
  let configuration = {
    owners: owners.map((wallet) => wallet.address),
    threshold: options.threshold ?? 2,
    nonce: '0',
    version: '1.4.1'
  }
  const request: SignatureRequest = options.version
    ? {
        handlerId: 'request-1',
        type: 'signTypedData',
        account: safe,
        chainId: 1,
        origin: 'test',
        payload: {
          id: 1,
          jsonrpc: '2.0',
          method: `eth_signTypedData_${options.version.toLowerCase()}`,
          params: [safe, []]
        },
        typedMessage: {
          version: options.version,
          data:
            options.version === SignTypedDataVersion.V1
              ? [{ name: 'Message', type: 'string', value: 'hello' }]
              : {
                  types: { EIP712Domain: [], Message: [{ name: 'value', type: 'string' }] },
                  primaryType: 'Message',
                  domain: {},
                  message: { value: 'hello' }
                }
        }
      }
    : {
        handlerId: 'request-1',
        type: 'sign',
        account: safe,
        chainId: 1,
        origin: 'test',
        payload: { id: 1, jsonrpc: '2.0', method: 'personal_sign', params: [safe, '0x6869'] },
        data: { decodedMessage: 'hi' }
      }
  const accounts = {
    [safe]: {
      id: safe,
      profileId: 'profile',
      address: safe,
      name: 'Safe',
      signer: '',
      lastSignerType: 'address',
      status: 'ok',
      created: 'safe:1',
      requests: { [request.handlerId]: request },
      safe: { '1': { chainId: 1, address: safe, configuration } }
    },
    ...Object.fromEntries(
      owners.map((wallet, index) => [
        wallet.address.toLowerCase(),
        {
          id: wallet.address.toLowerCase(),
          profileId: 'profile',
          address: wallet.address,
          name: `Owner ${index + 1}`,
          signer: `signer-${index + 1}`,
          lastSignerType: 'seed',
          status: 'ok',
          created: `owner:${index + 1}`,
          requests: {}
        }
      ])
    )
  }
  const state = {
    main: {
      currentProfile: 'profile',
      currentAccount: safe,
      appLock: { locked: false },
      accounts,
      signers: Object.fromEntries(
        owners.map((wallet, index) => [
          `signer-${index + 1}`,
          { id: `signer-${index + 1}`, type: 'seed', status: 'ok', addresses: [wallet.address] }
        ])
      )
    }
  }
  const signCounts = owners.map(() => 0)
  const frames = new Map<string, unknown>()
  frames.set(safe, {
    getRequest: () => request,
    patchRequest: (_id: string, update: (value: SignatureRequest) => void) => {
      update(request)
      return request
    },
    signTypedData: () => undefined
  })
  owners.forEach((wallet, index) => {
    frames.set(wallet.address.toLowerCase(), {
      getRequest: () => undefined,
      patchRequest: () => undefined,
      signTypedData: (typed: TypedMessage, callback: Callback<string>) => {
        signCounts[index]++
        const data = typed.data as Exclude<TypedMessage['data'], unknown[]>
        const { EIP712Domain: _domain, ...types } = data.types
        void wallet
          .signTypedData(data.domain as Parameters<typeof wallet.signTypedData>[0], types, data.message)
          .then((signature) => callback(null, signature), callback)
      }
    })
  })
  const getMessage = mock<SafeMessagePorts['client']['getMessage']>(async () => {
    throw new Error('service unavailable')
  })
  const createMessage = mock<SafeMessagePorts['client']['createMessage']>(async () => {
    throw new Error('service unavailable')
  })
  const validateMessage = mock(async () => true)
  const service = createSafeMessageService({
    store: {
      getState: () => state,
      subscribe: () => () => undefined
    } as never,
    accounts: { getFrameAccount: (id) => (frames.get(id) ?? null) as never },
    client: {
      configuration: mock(async () => structuredClone(configuration)),
      createMessage,
      getMessage,
      confirmMessage: mock(async () => undefined),
      validateMessage
    },
    clock: { delay: async () => undefined }
  })
  const context = {
    owner: { clientType: 'wallet-ui', windowInstanceId: 'test' },
    isOwnerActive: () => true,
    subscribeOwnerDisposed: () => () => undefined
  } as const
  return {
    service,
    request,
    owners,
    signCounts,
    getMessage,
    createMessage,
    validateMessage,
    context,
    setConfiguration(next: typeof configuration) {
      configuration = next
    },
    get configuration() {
      return configuration
    }
  }
}

it('accepts a service aggregate only after message identity and EIP-1271 validation', async () => {
  const test = fixture()
  test.getMessage.mockImplementation(async () => ({
    safe,
    messageHash: test.request.safeMessageProgress!.messageHash,
    message: '0x6869',
    confirmations: [],
    preparedSignature: '0x1234'
  }))
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'complete',
    signature: '0x1234'
  })
  expect(test.validateMessage).toHaveBeenCalledWith(
    1,
    safe,
    getOriginalMessageDigest('0x6869'),
    '0x1234',
    expect.any(AbortSignal)
  )
  expect(getOriginalMessageDigest('0x6869')).not.toBe(test.request.safeMessageProgress!.messageHash)
  expect(test.signCounts).toEqual([0, 0])
})

it('does not complete from an invalid service prepared signature', async () => {
  const test = fixture()
  test.validateMessage.mockImplementation(async () => false)
  test.getMessage.mockImplementation(async () => ({
    safe,
    messageHash: test.request.safeMessageProgress!.messageHash,
    message: '0x6869',
    confirmations: [],
    preparedSignature: '0xbad0'
  }))
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'pending'
  })
  expect(test.signCounts).toEqual([1, 0])
})

it('marks publication failure retryable and republishes the retained signature without signing again', async () => {
  const test = fixture()
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'pending'
  })
  expect(test.request.safeMessageProgress).toMatchObject({
    status: 'failed',
    confirmations: [test.owners[0].address]
  })
  expect(test.signCounts).toEqual([1, 0])

  test.createMessage.mockImplementation(async () => test.request.safeMessageProgress!.messageHash)
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'pending'
  })
  expect(test.createMessage).toHaveBeenCalledTimes(2)
  expect(test.signCounts).toEqual([1, 0])
  expect(test.request.safeMessageProgress?.status).toBe('collecting')
})

it('signs one selected owner per approval, deduplicates it, and completes at local threshold', async () => {
  const test = fixture()
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'pending'
  })
  expect(test.signCounts).toEqual([1, 0])
  expect(await test.service.approve(test.request, test.owners[0].address, test.context)).toEqual({
    status: 'pending'
  })
  expect(test.signCounts).toEqual([1, 0])
  const result = await test.service.approve(test.request, test.owners[1].address, test.context)
  expect(result.status).toBe('complete')
  if (result.status === 'complete') {
    expect(result.signature).toMatch(/^0x/)
  }
  expect(test.signCounts).toEqual([1, 1])
  expect(test.request.safeMessageProgress).toMatchObject({ status: 'complete', threshold: 2 })
})

it('cancels retained progress when on-chain configuration changes before another signature', async () => {
  const test = fixture()
  await test.service.approve(test.request, test.owners[0].address, test.context)
  test.setConfiguration({ ...test.configuration, threshold: 1 })
  let staleError: unknown
  try {
    await test.service.approve(test.request, test.owners[1].address, test.context)
  } catch (error) {
    staleError = error
  }
  expect(staleError).toBeInstanceOf(Error)
  expect((staleError as Error).message).toContain('Safe owners, threshold, or version changed')
  expect(test.signCounts).toEqual([1, 0])
  expect(test.request.safeMessageProgress?.status).toBe('cancelled')
})

it('keeps V1 local-only and reports when attached local owners cannot meet threshold', async () => {
  const test = fixture({ version: SignTypedDataVersion.V1, threshold: 2, ownerCount: 1 })
  test.setConfiguration({
    ...test.configuration,
    owners: [...test.configuration.owners, Wallet.createRandom().address],
    threshold: 2
  })
  let unsupportedError: unknown
  try {
    await test.service.approve(test.request, test.owners[0].address, test.context)
  } catch (error) {
    unsupportedError = error
  }
  expect(unsupportedError).toBeInstanceOf(Error)
  expect((unsupportedError as Error).message).toContain('local eligible owners cannot meet the threshold')
  expect(test.signCounts).toEqual([0])
  expect(test.getMessage).not.toHaveBeenCalled()
  expect(test.createMessage).not.toHaveBeenCalled()
})
