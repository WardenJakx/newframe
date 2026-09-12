import { Chains } from '../../src/features/networks/main/index.js'
import { createProviderProxyConnection } from '../../src/features/connections/main/provider/proxy.js'
import { createRevealService } from '../../src/features/transactions/main/reveal.js'
import type { NameResolutionService } from '../../src/features/name-resolution/main/nameResolution.js'
import { expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { createRequestService } from '../../src/features/requests/main/service.js'
import { createRequestApprovalAdapter } from '../../src/features/connections/main/provider/infrastructure/production.js'
import { Provider } from '../../src/features/connections/main/provider/index.js'
import { createProviderStatePort } from '../../src/features/connections/main/provider/statePort.js'
import { Accounts } from '../../src/features/accounts/main/index.js'
import { signerCompatibility, maxFee } from '../../src/features/transactions/main/index.js'
import { RequestStatus } from '../../src/features/requests/contract/requests.js'
import { createOperationService } from '../../src/platform/operations/service.js'
import { createProductionAirGapService } from '../../src/features/accounts/main/airgap/production.js'
import { signerFixture, transaction, uiContext, vectors } from './fixtures/airgap.js'

function integrationFixture(waitForNonce = false) {
  const f = signerFixture()
  const broadcasts: RPCRequestPayload[] = []
  const responses: RPCResponsePayload[] = []
  let nonceReply: RPCRequestCallback | undefined
  const rpc = {
    send(payload: RPCRequestPayload, callback: RPCRequestCallback) {
      if (payload.method === 'eth_getTransactionCount' && waitForNonce) {
        nonceReply = callback
        return
      }
      if (payload.method === 'eth_sendRawTransaction') broadcasts.push(payload)
      callback({
        id: payload.id,
        jsonrpc: '2.0',
        result: payload.method === 'eth_sendRawTransaction' ? '0x' + 'ab'.repeat(32) : '0x1'
      })
    },
    sendAsync(_payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) {
      callback(null, { id: 1, jsonrpc: '2.0', result: '0x1' })
    },
    getL1GasCost: async () => 0n
  }
  const service = createRequestService({
    accounts: {
      get: (id) => accounts.get(id),
      getFrameAccount: (id) => accounts.getFrameAccount(id),
      clearRequestsByOrigin: (accountId, originId) => accounts.clearRequestsByOrigin(accountId, originId),
      replaceTx: (id, replacement, principal) => accounts.replaceTx(id, replacement, principal),
      setRequestError: (id, error) => accounts.setRequestError(id, error),
      setRequestPending: (request) => accounts.setRequestPending(request),
      setRequestSuccess: (id) => accounts.setRequestSuccess(id),
      setTxSent: (id) =>
        f.store.getState().patchAccountRequest(f.address, id, (request) => {
          request.status = RequestStatus.Sent
        })
    },
    agent: { resolveAccess: () => false },
    clock: { delay: async () => {} },
    network: { rpcMatchesChain: async () => true },
    provider: {
      approveSign: (request, context) => approval.approveSign(request, context),
      approveSignTypedData: (request, context) => approval.approveSignTypedData(request, context),
      approveTransactionRequest: (request, context) => approval.approveTransactionRequest(request, context)
    },
    store: f.store,
    transactionPolicy: { signerCompatibility },
    vault: { exists: () => false, isUnlocked: () => true }
  })
  const names: NameResolutionService = Object.assign(new EventEmitter(), {
    started: false,
    start() {
      return undefined
    },
    dispose() {
      return undefined
    },
    ready: () => false,
    reverseLookup: async () => '',
    resolveAddress: async () => {
      throw new Error('Name lookup not used')
    }
  })
  const proxy = createProviderProxyConnection()
  const reveal = createRevealService(proxy, names)
  const chains = new Chains(f.store)
  chains.send = rpc.send.bind(rpc)
  const accounts = new Accounts(f.store, {
    chainRpc: {
      send: rpc.send,
      sendAsync: rpc.sendAsync,
      getL1GasCost: rpc.getL1GasCost,
      on() {
        return undefined
      },
      off() {
        return undefined
      }
    },
    transactionPolicy: { signerCompatibility, maxFee },
    simulation: {
      simulateTransactionEffects: async () => {
        throw new Error('Review already simulated')
      }
    },
    nameResolution: names,
    reveal,
    runtime: {
      now: () => 1,
      signers: { get: (id) => (id === f.signer.id ? f.signer : undefined) },
      navigation: {
        back() {
          return undefined
        },
        forward() {
          return undefined
        }
      },
      windows: {
        showTray() {
          return undefined
        }
      },
      persistence: {
        flush() {
          return undefined
        }
      },
      notify() {
        return undefined
      },
      openBlockExplorer() {
        return undefined
      },
      schedule: setTimeout
    },
    requests: service,
    createDataScanner: () => {
      throw new Error('Scanner not used')
    }
  })
  const provider = new Provider({
    accounts,
    chains,
    proxy,
    state: createProviderStatePort(f.store),
    store: f.store,
    reveal,
    requests: service
  })
  const approval = createRequestApprovalAdapter(provider)
  const data = transaction()
  if (waitForNonce) delete data.nonce
  const request = f.request('transaction', data)
  service.create((response) => responses.push(response), request.handlerId)
  service.bind(request)
  const airgap = createProductionAirGapService(
    f.store,
    { get: (id) => (id === f.signer.id ? f.signer : undefined) },
    createOperationService({ store: f.store, clock: { now: () => 1 } }),
    service
  )
  return {
    ...f,
    service,
    airgap,
    broadcasts,
    responses,
    nonceReply: () => nonceReply?.({ id: 1, jsonrpc: '2.0', result: '0x1' }),
    dispose() {
      airgap.dispose()
      service.dispose()
      approval.dispose()
      accounts.dispose()
      chains.dispose()
      proxy.dispose()
      names.dispose()
      f.dispose()
    }
  }
}

it('existing review approval opens AirGap, verifies its response and broadcasts exactly once', async () => {
  const f = integrationFixture()
  try {
    expect(f.signer.summary().airgapRequest).toBeUndefined()
    expect(f.broadcasts).toEqual([])
    expect(f.service.approve(f.owner.context.requestId, f.owner.context)).toBe(true)
    const reference = f.reference()
    const frame = f.frames(vectors.transactions[0].signature)[0]
    const scan = { ...reference, type: 'signer.airgap-scan', frame } as const
    for (const [ref, owner] of [
      [reference, uiContext().context.owner],
      [{ ...reference, sessionId: '00000000-0000-4000-8000-000000000000' }, f.owner.context.owner]
    ] as const) {
      expect(f.airgap.request(ref, owner)).toEqual({ ok: false, error: 'not_found' })
      expect(await f.airgap.scan({ ...scan, ...ref }, owner)).toBe(false)
      f.airgap.cancel(ref, owner)
    }
    expect(f.responses).toEqual([])
    expect(f.airgap.request(reference, f.owner.context.owner).ok).toBe(true)
    await f.airgap.scan(scan, f.owner.context.owner)
    await Promise.resolve()
    expect(f.broadcasts.map((payload) => payload.method)).toEqual(['eth_sendRawTransaction'])
    expect(f.broadcasts[0].params[0]).toBe(`0x${vectors.transactions[0].signedHex}`)
    expect(f.responses).toHaveLength(1)
    expect(f.responses[0].error).toBeUndefined()
    const completedRequest = f.store.getState().main.accounts[f.address].requests[reference.requestId]
    expect(completedRequest).toBeDefined()
    f.airgap.cancel(reference, f.owner.context.owner)
    expect(f.store.getState().main.accounts[f.address].requests[reference.requestId]).toBe(completedRequest)
    expect(await f.airgap.scan(scan, f.owner.context.owner)).toBe(false)
    f.service.approve(f.owner.context.requestId, f.owner.context)
    expect(f.broadcasts).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

for (const phase of ['nonce', 'before-query', 'reconstruction', 'cancel', 'shutdown'] as const)
  it(`never broadcasts when cancelled at ${phase}`, async () => {
    const f = integrationFixture(phase === 'nonce')
    try {
      f.service.approve(f.owner.context.requestId, f.owner.context)
      if (phase === 'nonce') {
        expect(f.signer.summary().airgapRequest).toBeUndefined()
        f.owner.destroy()
        f.nonceReply()
      } else {
        const reference = f.reference()
        const frame = f.frames(vectors.transactions[0].signature)[0]
        const command = { ...reference, type: 'signer.airgap-scan', frame } as const
        if (phase === 'reconstruction') {
          const scan = f.airgap.scan(command, f.owner.context.owner)
          // The signature resolved, but shared transaction reconstruction is still queued.
          expect(f.signer.summary().airgapRequest?.progress).toBe(1)
          f.owner.destroy()
          await scan
        } else {
          if (phase === 'before-query') f.owner.destroy()
          else if (phase === 'shutdown') f.service.dispose()
          else f.airgap.cancel(reference, f.owner.context.owner)
          expect(await f.airgap.scan(command, f.owner.context.owner)).toBe(false)
        }
      }
      await Promise.resolve()
      await Promise.resolve()
      expect(f.signer.summary().airgapRequest).toBeUndefined()
      expect(f.broadcasts).toEqual([])
      expect(f.responses).toHaveLength(1)
      expect(f.responses[0].error).toBeDefined()
    } finally {
      f.dispose()
    }
  })

it('warning confirmation binds the final approving window before opening AirGap', () => {
  const f = integrationFixture()
  try {
    f.store.getState().patchAccountRequest(f.address, f.owner.context.requestId, (request) => {
      request.approvalGate = { type: 'gas-fee', feeUSD: '100.00', currentSymbol: 'ETH' }
    })
    expect(f.service.approve(f.owner.context.requestId)).toBe(true)
    expect(f.signer.summary().airgapRequest).toBeUndefined()
    expect(f.service.confirmWarning(f.owner.context.requestId, 'gas-fee', f.owner.context)).toBe(true)
    expect(f.signer.summary().airgapRequest?.requestId).toBe(f.owner.context.requestId)
    f.owner.destroy()
    expect(f.signer.summary().airgapRequest).toBeUndefined()
    expect(f.broadcasts).toEqual([])
  } finally {
    f.dispose()
  }
})
