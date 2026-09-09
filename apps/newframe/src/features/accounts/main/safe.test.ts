import { afterEach, expect, it } from 'bun:test'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import { createTestStore } from '../../../../test/support/createTestStore'
import { createOperationService } from '../../../platform/operations/service'
import { createSafeClient } from '../../../platform/safe/client'
import { createSafeService } from './safe'
import type { SafeConfiguration } from '../domain/safe'

const address = '0x1111111111111111111111111111111111111111'
const ownerAddress = '0x2222222222222222222222222222222222222222'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'test' }
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))
function setup() {
  const base = createTestStore()
  // Canonical actions retain their real Immer store; add selector subscriptions as production does.
  const selectorStore = createStore(subscribeWithSelector(() => base.getState()))
  base.store.subscribe((state) => selectorStore.setState(state, true))
  const store = { ...base.store, subscribe: selectorStore.subscribe }
  const operations = createOperationService({ store, clock: { now: Date.now } })
  const accounts = {
    add: (id: string, name: string) => {
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
  }
  return { store, operations, accounts }
}
async function until(condition: () => boolean) {
  for (let n = 0; n < 200; n++) {
    if (condition()) return
    await Bun.sleep(5)
  }
  throw new Error('Timed out')
}
it('imports through real HTTP, merges chains, retains queue on later-page failure, coalesces and refreshes selection', async () => {
  let fail = false
  let info = 0
  const configuration = {
    address,
    owners: [ownerAddress],
    threshold: 1,
    nonce: '9007199254740993',
    version: '1.4.1'
  }
  const proposal = {
    safeTxHash: `0x${'a'.repeat(64)}`,
    safe: address,
    nonce: '9007199254740993',
    to: ownerAddress,
    value: '100000000000000000000',
    operation: 0,
    isExecuted: false,
    data: null,
    confirmations: []
  }
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname.includes('/v1/')) {
        info++
        return Response.json(configuration)
      }
      if (url.searchParams.has('page'))
        return fail
          ? new Response('failed', { status: 500 })
          : Response.json({
              next: null,
              results: [{ ...proposal, safeTxHash: `0x${'b'.repeat(64)}`, nonce: '9007199254740994' }]
            })
      return Response.json({
        next: `${url.origin}${url.pathname}?executed=false&nonce__gte=9007199254740993&page=2`,
        results: [proposal, proposal]
      })
    }
  })
  cleanup.push(() => server.stop(true))
  const { store, operations, accounts } = setup()
  const service = createSafeService({
    accounts,
    store,
    operations,
    client: createSafeClient({
      request: fetch,
      networks: { '1': `${server.url}api`, '100': `${server.url}api` }
    })
  })
  cleanup.push(service.dispose)
  const add = (chainId: number) =>
    service.import({ type: 'account.safe-import', operationId: `import-${chainId}`, address, chainId }, owner)
  expect(add(1)).toBeTrue()
  await until(() => store.getState().operations['import-1']?.operation.status === 'succeeded')
  expect(store.getState().main.currentAccount).not.toBe(address)
  store.getState().patchAccount(address, { name: 'Treasury' })
  expect(add(100)).toBeTrue()
  await until(() => store.getState().operations['import-100']?.operation.status === 'succeeded')
  expect(Object.keys(store.getState().main.accounts[address].safe!)).toEqual(['1', '100'])
  expect(store.getState().main.accounts[address].name).toBe('Treasury')
  const snapshot = store.getState().main.accounts[address].safe!['1']
  expect(snapshot.pending).toHaveLength(2)
  fail = true
  const count = info
  await Promise.all([
    service.refresh({ type: 'account.safe-refresh', accountId: address, chainId: 1, force: true }),
    service.refresh({ type: 'account.safe-refresh', accountId: address, chainId: 1, force: true })
  ])
  expect(info).toBe(count + 1)
  expect(store.getState().main.accounts[address].safe!['1']).toMatchObject({
    pending: snapshot.pending,
    refreshedAt: snapshot.refreshedAt,
    error: expect.any(String)
  })
  store.getState().setAccount({ id: address })
  await Bun.sleep(10)
  expect(info).toBe(count + 1)
})
it('creates nothing for invalid info and rejects cross-profile imports', async () => {
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ owners: [], threshold: 0, nonce: -1 }) })
  cleanup.push(() => server.stop(true))
  const { store, operations, accounts } = setup()
  const service = createSafeService({
    accounts,
    store,
    operations,
    client: createSafeClient({ request: fetch, networks: { '1': `${server.url}api` } })
  })
  cleanup.push(service.dispose)
  service.import({ type: 'account.safe-import', operationId: 'bad', address, chainId: 1 }, owner)
  await until(() => store.getState().operations.bad?.operation.status === 'failed')
  expect(store.getState().main.accounts[address]).toBeUndefined()
  store.getState().createProfile('other', 'Other')
  store.getState().upsertAccount({ id: address, profileId: 'other', name: 'Other treasury' })
  service.import({ type: 'account.safe-import', operationId: 'other', address, chainId: 1 }, owner)
  await until(() => store.getState().operations.other?.operation.status === 'failed')
  expect(store.getState().main.accounts[address].profileId).toBe('other')
})
it('invalidates delayed work after remove/re-add, profile switch, and disposal', async () => {
  for (const change of ['remove', 'profile', 'dispose']) {
    const { store, operations, accounts } = setup()
    const config: SafeConfiguration = { owners: [ownerAddress], threshold: 1, nonce: '0' }
    store
      .getState()
      .upsertAccount({ id: address, safe: { '1': { chainId: 1, address, configuration: config } } })
    let release!: (value: SafeConfiguration) => void
    const service = createSafeService({
      accounts,
      store,
      operations,
      client: {
        supportedNetworks: () => [1],
        configuration: () =>
          new Promise((resolve) => {
            release = resolve
          }),
        pending: async () => []
      }
    })
    cleanup.push(service.dispose)
    const refreshing = service.refresh({
      type: 'account.safe-refresh',
      accountId: address,
      chainId: 1,
      force: true
    })
    if (change === 'remove') {
      store.getState().removeAccount(address)
      store.getState().upsertAccount({ id: address, name: 'Re-added' })
    }
    if (change === 'profile') {
      store.getState().createProfile('other', 'Other')
      store.getState().selectProfile('other')
    }
    if (change === 'dispose') service.dispose()
    release(config)
    await refreshing
    expect(store.getState().main.accounts[address].safe?.['1'].refreshedAt).toBeUndefined()
  }
})

it('imports valid configuration when the initial queue fails, leaving pending unavailable', async () => {
  const server = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname.includes('/v1/')
        ? Response.json({ address, owners: [ownerAddress], threshold: 1, nonce: 0 })
        : new Response('unavailable', { status: 503 })
  })
  cleanup.push(() => server.stop(true))
  const { store, operations, accounts } = setup()
  const service = createSafeService({
    accounts,
    store,
    operations,
    client: createSafeClient({ request: fetch, networks: { '1': `${server.url}api` } })
  })
  cleanup.push(service.dispose)
  service.import({ type: 'account.safe-import', operationId: 'partial', address, chainId: 1 }, owner)
  await until(() => store.getState().operations.partial?.operation.status === 'succeeded')
  expect(store.getState().main.accounts[address].safe!['1']).toMatchObject({
    configuration: { nonce: '0' },
    error: 'Safe service HTTP 503'
  })
  expect(store.getState().main.accounts[address].safe!['1'].pending).toBeUndefined()
})
