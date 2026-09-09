import { expect, it } from 'bun:test'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import { createSafeHandler } from '../../scripts/local-safe/handler'
import { createSafeService } from '../../src/features/accounts/main/safe'
import { createOperationService } from '../../src/platform/operations/service'
import { createSafeClient } from '../../src/platform/safe/client'
import { projectRendererState } from '../../src/platform/state-sync/main/projections'
import { createTestStore } from '../support/createTestStore'

it('projects the paginated local Safe service through public observation capabilities', async () => {
  const address = '0x1111111111111111111111111111111111111111'
  const owner = { clientType: 'wallet-ui', windowInstanceId: 'safe-integration' } as const
  const handler = createSafeHandler({
    chainId: 31337,
    safe: address,
    owners: ['0x2222222222222222222222222222222222222222'],
    threshold: 1,
    version: '1.5.0'
  })
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler.fetch })
  const base = createTestStore()
  const selectors = createStore(subscribeWithSelector(() => base.getState()))
  const unsubscribe = base.store.subscribe((state) => selectors.setState(state, true))
  const store = { ...base.store, subscribe: selectors.subscribe }
  const service = createSafeService({
    store,
    operations: createOperationService({ store, clock: { now: Date.now } }),
    accounts: {
      add: (id, name) => {
        store.getState().upsertAccount({
          id,
          address: id,
          name,
          lastSignerType: 'Address',
          signer: '',
          status: 'ok',
          requests: {},
          created: 'new:1'
        })
      }
    },
    client: createSafeClient({ request: fetch, networks: { '31337': `${server.url}api` } })
  })
  try {
    expect(
      service.import(
        { type: 'account.safe-import', operationId: 'watch-safe', address, chainId: 31337 },
        owner
      )
    ).toBeTrue()
    for (
      let attempt = 0;
      attempt < 200 && store.getState().operations['watch-safe']?.operation.status === 'pending';
      attempt++
    )
      await Bun.sleep(5)
    const projection = projectRendererState(store.getState(), owner)
    expect(projection.operations['watch-safe'].status).toBe('succeeded')
    const account = projection.accounts[address]
    if (!('safe' in account) || !account.safe) throw new Error('Wallet projection missing Safe')
    const deployment = account.safe['31337']
    expect(deployment.configuration.version).toBe('1.5.0')
    expect(deployment.pending).toHaveLength(4)
    expect(deployment.pending?.find((proposal) => proposal.operation === 1)).toMatchObject({
      data: '0xdeadbeef00112233',
      nonce: '2'
    })
    expect(deployment.pending?.find((proposal) => proposal.dataDecoded)?.dataDecoded).toMatchObject({
      method: 'transfer',
      parameters: [
        { name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' },
        { name: 'value', type: 'uint256', value: '1' }
      ]
    })
    expect(handler.requests.some((request) => request.includes('offset=2'))).toBeTrue()
    handler.failNext(503, undefined, 2)
    await service.refresh({ type: 'account.safe-refresh', accountId: address, chainId: 31337, force: true })
    const refreshed = projectRendererState(store.getState(), owner).accounts[address]
    if (!('safe' in refreshed) || !refreshed.safe) throw new Error('Wallet projection lost Safe')
    const failed = refreshed.safe['31337']
    expect(failed.pending).toEqual(deployment.pending)
    expect(failed.refreshedAt).toBe(deployment.refreshedAt)
    expect(failed.error).toContain('503')
  } finally {
    service.dispose()
    unsubscribe()
    server.stop(true)
  }
})

it('ignores a real HTTP refresh response released after Safe removal', async () => {
  const address = '0x1111111111111111111111111111111111111111'
  const owner = { clientType: 'wallet-ui', windowInstanceId: 'safe-removal' } as const
  const handler = createSafeHandler({
    chainId: 31337,
    safe: address,
    owners: ['0x2222222222222222222222222222222222222222'],
    threshold: 1
  })
  let delay = false
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const delivered = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (delay && new URL(request.url).pathname.includes('/v1/')) {
        entered.resolve()
        await release.promise
        const response = await handler.fetch(request)
        delivered.resolve()
        return response
      }
      return handler.fetch(request)
    }
  })
  const base = createTestStore()
  const selectors = createStore(subscribeWithSelector(() => base.getState()))
  const unsubscribe = base.store.subscribe((state) => selectors.setState(state, true))
  const store = { ...base.store, subscribe: selectors.subscribe }
  const service = createSafeService({
    store,
    operations: createOperationService({ store, clock: { now: Date.now } }),
    accounts: {
      add: (id, name) => {
        store.getState().upsertAccount({
          id,
          address: id,
          name,
          lastSignerType: 'Address',
          signer: '',
          status: 'ok',
          requests: {},
          created: 'new:1'
        })
      }
    },
    client: createSafeClient({ request: fetch, networks: { '31337': `${server.url}api` } })
  })
  try {
    service.import(
      { type: 'account.safe-import', operationId: 'remove-safe', address, chainId: 31337 },
      owner
    )
    for (
      let attempt = 0;
      attempt < 200 && store.getState().operations['remove-safe']?.operation.status === 'pending';
      attempt++
    )
      await Bun.sleep(5)
    expect(store.getState().operations['remove-safe'].operation.status).toBe('succeeded')
    delay = true
    const refreshing = service.refresh({
      type: 'account.safe-refresh',
      accountId: address,
      chainId: 31337,
      force: true
    })
    await entered.promise
    store.getState().removeAccount(address)
    release.resolve()
    await delivered.promise
    await refreshing
    expect(store.getState().main.accounts[address]).toBeUndefined()
    expect(projectRendererState(store.getState(), owner).accounts[address]).toBeUndefined()
  } finally {
    release.resolve()
    service.dispose()
    unsubscribe()
    server.stop(true)
  }
})
