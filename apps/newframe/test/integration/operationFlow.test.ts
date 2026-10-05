import { expect, it, mock } from 'bun:test'

import { CommandResultSchema } from '../../src/app/contracts/operations.ts'
import { DEFAULT_PROFILE_ID } from '../../src/app/contracts/state/main.ts'
import type { OperationServices } from '../../src/app/main/ipc-handlers/tray.ts'
import { createOperationDispatcher } from '../../src/core/entry/tray/operations.ts'
import { createTokenService } from '../../src/core/services/assets/tokens/service.ts'
import type { AccountRequest, TransactionRequest } from '../../src/features/requests/contract/requests.ts'
import { createRequestService } from '../../src/features/requests/main/service.ts'
import { createRequestTrayCapabilities } from '../../src/features/requests/renderer/requestCapabilities.ts'
import { GasFeesSource } from '../../src/features/transactions/domain/index.ts'
import { createOperationService } from '../../src/platform/operations/service.ts'
import createInitialState from '../../src/platform/state-store/state/index.ts'
import { projectTrayState } from '../../src/platform/state-sync/main/projections.ts'
import { createTestStore } from '../support/createTestStore.ts'

const owner = { clientType: 'main-tray', entrypoint: 'tray', windowInstanceId: 'wallet-window' } as const

it('authorizes and validates final adjustments against canonical state before signing once', async () => {
  const accountId = '0x1111111111111111111111111111111111111111'
  const request: TransactionRequest = {
    requestId: 'approve-1',
    type: 'transaction',
    account: accountId,
    origin: 'app.example',
    payload: {
      id: 1,
      jsonrpc: '2.0',
      _origin: 'app.example',
      method: 'eth_sendTransaction',
      params: [{ from: accountId, to: accountId, chainId: '0x1' }]
    },
    authorization: {
      actionId: 'action-1',
      decision: 'prompt',
      decidedAt: 1,
      requestSource: { kind: 'rpc', transport: 'http', connectionId: 'connection-1', origin: 'app.example' },
      intent: { requestType: 'transaction', account: accountId, method: 'eth_sendTransaction' }
    },
    data: {
      chainId: '0x1',
      type: '0x0',
      from: accountId,
      to: accountId,
      value: '0x1',
      gasLimit: '0x5208',
      gasPrice: '0x1',
      gasFeesSource: GasFeesSource.Dapp
    },
    approvals: [],
    recognizedActions: [],
    feesUpdatedByUser: false,
    recipientType: '',
    classification: 'NATIVE_TRANSFER'
  } as TransactionRequest
  const store = createTestStore({
    main: {
      currentAccount: 'different-account',
      accounts: {
        [accountId]: {
          id: accountId,
          profileId: DEFAULT_PROFILE_ID,
          address: accountId,
          name: 'Test account',
          lastSignerType: 'ledger',
          status: 'ok',
          signer: 'signer',
          created: 'test:1',
          requests: { [request.requestId]: request }
        }
      },
      signers: {
        signer: {
          id: 'signer',
          name: 'Test Ledger',
          model: 'Nano',
          type: 'ledger',
          status: 'ok',
          addresses: [accountId],
          appVersion: { major: 1, minor: 0, patch: 0 },
          capabilities: []
        }
      },
      mute: {
        explorerWarning: false,
        gasFeeWarning: true,
        onboardingWindow: false,
        signerCompatibilityWarning: true
      }
    }
  })
  const current = () =>
    store.getState().main.accounts[accountId].requests[request.requestId] as TransactionRequest
  const patchRequest = <T extends AccountRequest>(id: string, update: (value: T) => void) => {
    store.getState().patchAccountRequest(accountId, id, update as never)
    return current() as unknown as T
  }
  const account = { signer: 'signer', getRequest: current, patchRequest }
  const completion = Promise.withResolvers<string>()
  const approveTransactionRequest = mock((_request: TransactionRequest) => completion.promise)
  const requests = createRequestService({
    accounts: {
      getFrameAccount: (id: string) => (id === accountId ? account : undefined),
      setRequestPending: () =>
        patchRequest(request.requestId, (value) => {
          value.status = 'pending' as never
        }),
      setTxSent: () =>
        patchRequest(request.requestId, (value) => {
          value.status = 'verifying' as never
        })
    } as never,
    provider: { approveTransactionRequest } as never,
    transactionPolicy: { signerCompatibility: () => ({ compatible: true }) } as never,
    store: store.store,
    vault: { exists: () => false, isUnlocked: () => true },
    aiSession: { resolveAccess: () => false },
    clock: { delay: async () => {} },
    chain: { rpcMatchesChain: async () => true }
  })
  requests.create(mock(), request.requestId)
  requests.bind(request)
  let authorized = true
  const dispatcher = createOperationDispatcher({
    requests,
    authorizeTray: () => (authorized ? { ...owner, webContentsId: 1 } : undefined)
  } as unknown as OperationServices)
  const capabilities = createRequestTrayCapabilities({
    executeCommand: async (command) =>
      CommandResultSchema.parse(await dispatcher.dispatchCommand({} as never, command)),
    executeQuery: async () => ({ ok: false, error: 'unauthorized' })
  })
  const adjustments = { gasPrice: '0x2', gasLimit: '0x6000', nonce: '0x4' }
  authorized = false
  expect((await capabilities.review.approve({ requestId: request.requestId, adjustments })).ok).toBeFalse()
  authorized = true
  for (const invalid of [
    { to: accountId },
    { nonce: '-0x1' },
    { maxFeePerGas: '0x1' },
    { nonce: '0x4', gasPrice: '0xffffffffffffffff' }
  ]) {
    expect(
      CommandResultSchema.parse(
        await dispatcher.dispatchCommand({} as never, {
          type: 'request.approve',
          requestId: request.requestId,
          adjustments: invalid
        })
      ).ok
    ).toBeFalse()
    expect(current()).toEqual(request)
    expect(approveTransactionRequest).not.toHaveBeenCalled()
  }
  expect(await capabilities.review.approve({ requestId: request.requestId, adjustments })).toEqual({
    ok: true
  })
  expect(approveTransactionRequest).toHaveBeenCalledTimes(1)
  expect(approveTransactionRequest.mock.calls[0]?.[0].data).toEqual({ ...request.data, ...adjustments })
  expect(approveTransactionRequest.mock.calls[0]?.[0].account).toBe(accountId)
  expect(current().feesUpdatedByUser).toBeTrue()
  expect(
    (await capabilities.review.approve({ requestId: request.requestId, adjustments: { nonce: '0x5' } })).ok
  ).toBeFalse()
  completion.resolve('0xhash')
  await completion.promise
  await Promise.resolve()
  expect(
    (await capabilities.review.approve({ requestId: request.requestId, adjustments: { nonce: '0x5' } })).ok
  ).toBeFalse()
  expect(await capabilities.review.approve({ requestId: request.requestId })).toEqual({ ok: true })
  expect(current().data.nonce).toBe('0x4')
  expect(approveTransactionRequest).toHaveBeenCalledTimes(1)
})

it('acknowledges a real command and projects its completion only to the owning window', async () => {
  const store = createTestStore(createInitialState())
  const operations = createOperationService({ store: store.store, clock: { now: () => 10 } })
  const tokens = createTokenService({ lookup: async () => undefined, operations, store: store.store })
  const services = {
    accounts: { current: () => null, get: () => undefined },
    protectedOperations: { exportPrivateKey: async () => undefined },
    airgap: {} as OperationServices['airgap'],
    safes: {} as OperationServices['safes'],
    accountMutations: {} as OperationServices['accountMutations'],
    accountOnboarding: {} as OperationServices['accountOnboarding'],
    aiSession: {} as OperationServices['aiSession'],
    chains: {} as OperationServices['chains'],
    portfolio: {} as OperationServices['portfolio'],
    profiles: {} as OperationServices['profiles'],
    platform: {} as OperationServices['platform'],
    requestEdits: {} as OperationServices['requestEdits'],
    requests: {} as OperationServices['requests'],
    security: {} as OperationServices['security'],
    send: {} as OperationServices['send'],
    settings: {} as OperationServices['settings'],
    trade: {} as OperationServices['trade'],
    tokens,
    authorizeTray: () => ({ ...owner, webContentsId: 1 }),
    requestTokenImage: () => undefined,
    resolveName: async () => ''
  } satisfies OperationServices
  const result = await createOperationDispatcher(services).dispatchCommand({} as never, {
    type: 'token.add',
    operationId: 'add-token',
    token: {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 99,
      decimals: 18,
      logoURI: '',
      name: 'Token',
      symbol: 'TKN'
    }
  })

  expect({
    result,
    owned: projectTrayState(store.getState(), owner).operations['add-token'],
    otherWindow: projectTrayState(store.getState(), {
      clientType: 'main-tray',
      windowInstanceId: 'other-window'
    }).operations
  }).toEqual({
    result: { ok: true },
    owned: {
      id: 'add-token',
      type: 'token.add',
      status: 'succeeded',
      phase: 'completed',
      entityRefs: [{ type: 'token', id: '99:0x1111111111111111111111111111111111111111' }],
      startedAt: 10,
      updatedAt: 10,
      finishedAt: 10
    },
    otherWindow: {}
  })
})
