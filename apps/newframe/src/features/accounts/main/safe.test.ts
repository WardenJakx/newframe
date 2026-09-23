import { afterEach, expect, it, mock } from 'bun:test'

import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createOperationService } from '../../../platform/operations/service'
import { createSafeClient } from '../../../platform/safe/client'
import type { SafeConfiguration, SafeProposal, SafeProposalSimulation } from '../domain/safe'
import { createSafeService, type SafeServicePorts } from './safe'

const address = '0x1111111111111111111111111111111111111111'
const ownerAddress = '0x2222222222222222222222222222222222222222'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'test' }
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (dispose) => dispose()))
})
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
    if (condition()) {
      return
    }
    await Bun.sleep(5)
  }
  throw new Error('Timed out')
}

function operationStatus(
  state: { operations: Record<string, { operation: { status: string } } | undefined> },
  operationId: string
) {
  return state.operations[operationId]?.operation.status
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
      if (url.searchParams.has('page')) {
        return fail
          ? new Response('failed', { status: 500 })
          : Response.json({
              next: null,
              results: [{ ...proposal, safeTxHash: `0x${'b'.repeat(64)}`, nonce: '9007199254740994' }]
            })
      }
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
  cleanup.push(() => service.dispose())
  const add = (chainId: number) =>
    service.import(
      { type: 'account.create', source: 'safe', operationId: `import-${chainId}`, address, chainId },
      owner
    )
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
    service.refresh({ type: 'account.refresh', accountId: address, chainId: 1, force: true }),
    service.refresh({ type: 'account.refresh', accountId: address, chainId: 1, force: true })
  ])
  expect(info).toBe(count + 1)
  expect(store.getState().main.accounts[address].safe!['1']).toMatchObject({
    pending: snapshot.pending,
    refreshedAt: snapshot.refreshedAt,
    error: expect.any(String) as unknown
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
  cleanup.push(() => service.dispose())
  service.import({ type: 'account.create', source: 'safe', operationId: 'bad', address, chainId: 1 }, owner)
  await until(() => operationStatus(store.getState(), 'bad') === 'failed')
  expect(store.getState().main.accounts[address]).toBeUndefined()
  store.getState().createProfile('other', 'Other')
  store.getState().upsertAccount({ id: address, profileId: 'other', name: 'Other treasury' })
  service.import({ type: 'account.create', source: 'safe', operationId: 'other', address, chainId: 1 }, owner)
  await until(() => operationStatus(store.getState(), 'other') === 'failed')
  expect(store.getState().main.accounts[address].profileId).toBe('other')
})
it('invalidates delayed work after remove/re-add, profile switch, and disposal', async () => {
  for (const change of ['remove', 'profile', 'dispose']) {
    const { store, operations, accounts } = setup()
    const config: SafeConfiguration = { owners: [ownerAddress], threshold: 1, nonce: '0' }
    store.getState().upsertAccount({
      id: address,
      safe: { '1': { chainId: 1, address, configuration: config } }
    })
    let release!: (value: SafeConfiguration) => void
    const service = createSafeService({
      accounts,
      store,
      operations,
      client: {
        discover: async () => ({ version: '1.4.1', owners: [ownerAddress] }),
        configuration: () =>
          new Promise((resolve) => {
            release = resolve
          }),
        queueState: async () => config,
        pending: async () => []
      }
    })
    cleanup.push(() => service.dispose())
    const refreshing = service.refresh({
      type: 'account.refresh',
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
    if (change === 'dispose') {
      service.dispose()
    }
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
  cleanup.push(() => service.dispose())
  service.import(
    { type: 'account.create', source: 'safe', operationId: 'partial', address, chainId: 1 },
    owner
  )
  await until(() => operationStatus(store.getState(), 'partial') === 'succeeded')
  expect(store.getState().main.accounts[address].safe!['1']).toMatchObject({
    configuration: { nonce: '0' },
    error: 'Safe service HTTP 503'
  })
  expect(store.getState().main.accounts[address].safe!['1'].pending).toBeUndefined()
})

it('probes all configured chains, retains successes and discards stale discovery after disposal', async () => {
  const { store, accounts, operations } = setup()
  const networks = Object.values(store.getState().main.networks.ethereum)
  expect(networks.length).toBeGreaterThan(1)
  const found = networks[networks.length - 1]
  const checked: number[] = []
  let release: (() => void) | undefined
  let delay = false
  const service = createSafeService({
    store,
    accounts,
    operations,
    client: {
      discover: async (chainId, requestedAddress) => {
        checked.push(chainId)
        expect(requestedAddress).toBe(address)
        if (chainId !== found.id) {
          throw new Error('Not a Safe')
        }
        if (delay) {
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        return { version: '1.4.1', owners: [ownerAddress] }
      },
      configuration: async () => ({ version: '1.4.1', owners: [ownerAddress], threshold: 1, nonce: '0' }),
      queueState: async () => ({ nonce: '0' }),
      pending: async () => {
        throw new Error('No queue service')
      }
    }
  })
  cleanup.push(() => service.dispose())
  expect(await service.discoverNetworks(address)).toEqual([
    { chainId: found.id, name: found.name, supported: true }
  ])
  expect(checked.sort((a, b) => a - b)).toEqual(networks.map((network) => network.id).sort((a, b) => a - b))
  service.import(
    { type: 'account.create', source: 'safe', operationId: 'rpc-only', address, chainId: found.id },
    owner
  )
  await until(() => Boolean(store.getState().main.accounts[address]?.safe?.[String(found.id)]?.error))
  expect(store.getState().main.accounts[address].safe![String(found.id)].configuration.version).toBe('1.4.1')
  delay = true
  const pending = service.discoverNetworks(address)
  service.dispose()
  release!()
  expect(await pending).toEqual([])
})

function simulationSetup() {
  const context = setup()
  const proposal: SafeProposal = {
    safeTxHash: `0x${'a'.repeat(64)}`,
    safe: address,
    nonce: '0',
    to: ownerAddress,
    value: '123',
    operation: 0,
    data: '0x',
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: address,
    refundReceiver: ownerAddress,
    confirmations: []
  }
  const configuration = { owners: [ownerAddress], threshold: 1, nonce: '0' }
  context.store.getState().upsertAccount({
    id: address,
    address,
    signer: '',
    requests: {},
    safe: {
      '1': { address, chainId: 1, configuration, pending: [proposal], refreshedAt: Date.now() }
    }
  })
  const client = {
    configuration: async () => configuration,
    queueState: async () => ({ nonce: configuration.nonce }),
    pending: async () => [proposal],
    discover: async () => ({ version: '1.5.0', owners: [ownerAddress] })
  }
  const query = {
    type: 'safe.simulate' as const,
    accountId: address,
    chainId: 1,
    safeTxHash: proposal.safeTxHash
  }
  return { ...context, client, query, proposal }
}
const simulated: SafeProposalSimulation = {
  status: 'success',
  effects: [],
  assumptions: ['Unsigned'],
  currentNonce: '0',
  blockNumber: '123'
}

it('refreshes the full onchain Safe configuration before every service queue import', async () => {
  const context = simulationSetup()
  let now = Date.now() + 60_000
  const freshConfiguration = {
    ...context.store.getState().main.accounts[address].safe!['1'].configuration,
    nonce: '1'
  }
  const configuration = mock(async () => freshConfiguration)
  const pending = mock<SafeServicePorts['client']['pending']>(context.client.pending)
  const service = createSafeService({
    ...context,
    client: { ...context.client, configuration, pending },
    now: () => now
  })
  cleanup.push(() => service.dispose())
  service.import(
    { type: 'account.create', source: 'safe', operationId: 'import', address, chainId: 1 },
    owner
  )
  await until(() => operationStatus(context.store.getState(), 'import') === 'succeeded')
  const cached = context.store.getState().main.accounts[address].safe!['1'].configuration
  await service.refresh({ type: 'account.refresh', accountId: address, force: true })
  expect(pending.mock.calls.at(-1)?.[2]).toEqual(cached)
  expect(context.store.getState().main.accounts[address].safe!['1'].pending).toEqual([])
  now += 60_000
  context.store.getState().setAccount({ id: address })
  await until(() => configuration.mock.calls.length === 3)
  await service.refresh({ type: 'account.refresh', accountId: address })
  expect(configuration).toHaveBeenCalledTimes(3)
  expect(context.store.getState().main.accounts[address].safe!['1'].configuration.owners).toEqual(
    cached.owners
  )
})

it('retains configuration observed during simulation even when the preview is unavailable', async () => {
  const context = simulationSetup()
  const observed = { owners: [address], threshold: 1, nonce: '1', version: '1.4.1' }
  const service = createSafeService({
    ...context,
    simulate: async (_input, _signal, observe) => {
      observe(observed, '124')
      return { status: 'unavailable', error: 'Proposal nonce has already passed.' }
    }
  })
  cleanup.push(() => service.dispose())
  expect(await service.simulate(context.query)).toMatchObject({
    status: 'unavailable',
    error: 'Proposal nonce has already passed.'
  })
  expect(context.store.getState().main.accounts[address].safe!['1']).toMatchObject({
    configuration: observed,
    configurationBlockNumber: '124',
    pending: [context.proposal]
  })
})

it('merges refreshed service proposals without discarding local lifecycle metadata', async () => {
  const context = simulationSetup()
  const deployment = context.store.getState().main.accounts[address].safe!['1']
  const local = {
    createdAt: 42,
    requestId: 'request-1',
    confirmations: [],
    publication: { status: 'failed' as const, error: 'retry' },
    execution: { status: 'idle' as const }
  }
  context.store.getState().patchAccount(address, {
    safe: {
      '1': {
        ...deployment,
        pending: [{ ...context.proposal, local }]
      }
    }
  })
  const service = createSafeService({
    ...context,
    client: {
      ...context.client,
      pending: async () => [{ ...context.proposal, confirmations: [ownerAddress] }]
    }
  })
  cleanup.push(() => service.dispose())
  await service.refresh({ type: 'account.refresh', accountId: address, chainId: 1, force: true })
  expect(context.store.getState().main.accounts[address].safe!['1'].pending![0]).toMatchObject({
    confirmations: [ownerAddress],
    local
  })
})

it('does not replace a newer configuration with an older concurrent simulation observation', async () => {
  const context = simulationSetup()
  const other = { ...context.proposal, safeTxHash: `0x${'b'.repeat(64)}` }
  const deployment = context.store.getState().main.accounts[address].safe!['1']
  context.store
    .getState()
    .patchAccount(address, { safe: { '1': { ...deployment, pending: [context.proposal, other] } } })
  const observers: Array<(configuration: SafeConfiguration, block: string) => void> = []
  const service = createSafeService({
    ...context,
    simulate: async (_input, _signal, observe) => {
      observers.push(observe)
      return new Promise(() => {})
    }
  })
  cleanup.push(() => service.dispose())
  const first = service.simulate(context.query)
  const second = service.simulate({ ...context.query, safeTxHash: other.safeTxHash })
  await Promise.resolve()
  const newer = { owners: [address], threshold: 1, nonce: '1' }
  observers[1](newer, '125')
  observers[0](deployment.configuration, '124')
  expect(context.store.getState().main.accounts[address].safe!['1'].configuration).toEqual(newer)
  service.dispose()
  await Promise.all([first, second])
})

it('simulates the canonical unsigned proposal without a signer and coalesces equivalent concurrent queries', async () => {
  const context = simulationSetup()
  let calls = 0
  let release!: (result: SafeProposalSimulation) => void
  const service = createSafeService({
    ...context,
    simulate: async (input) => {
      calls++
      expect(input.proposal).toEqual(context.proposal)
      return new Promise((resolve) => {
        release = resolve
      })
    }
  })
  cleanup.push(() => service.dispose())
  const first = service.simulate(context.query)
  const duplicate = service.simulate(context.query)
  expect(first).toBe(duplicate)
  await Promise.resolve()
  expect(calls).toBe(1)
  const account = context.store.getState().main.accounts[address]
  expect(account.signer).toBe('')
  const deployment = account.safe!['1']
  context.store.getState().patchAccount(address, {
    name: 'Renamed',
    safe: {
      '1': {
        ...deployment,
        refreshedAt: Date.now() + 1,
        pending: [
          {
            ...context.proposal,
            confirmations: [ownerAddress],
            dataDecoded: { method: 'renamed', parameters: [] }
          }
        ]
      }
    }
  })
  release(simulated)
  expect(await first).toEqual(simulated)
  expect(context.store.getState().main.accounts[address].requests).toEqual({})
  expect(await service.simulate({ ...context.query, safeTxHash: `0x${'b'.repeat(64)}` })).toMatchObject({
    status: 'unavailable'
  })
  expect(calls).toBe(1)
})

it('settles in-flight simulations on semantic proposal changes, account lifetime, profile, and disposal', async () => {
  for (const change of ['proposal', 'remove', 'profile', 'dispose']) {
    const context = simulationSetup()
    let signal!: AbortSignal
    let observe!: (configuration: SafeConfiguration, block: string) => void
    const service = createSafeService({
      ...context,
      simulate: (_input, captured, observation) => {
        signal = captured
        observe = observation
        return new Promise(() => {})
      }
    })
    cleanup.push(() => service.dispose())
    const pending = service.simulate(context.query)
    await Promise.resolve()
    const old = context.store.getState().main.accounts[address]
    if (change === 'proposal') {
      context.store.getState().patchAccount(address, {
        safe: { '1': { ...old.safe!['1'], pending: [{ ...context.proposal, value: '456' }] } }
      })
    }
    if (change === 'remove') {
      context.store.getState().removeAccount(address)
      context.store.getState().upsertAccount({ ...old, requests: {} })
    }
    if (change === 'profile') {
      context.store.getState().createProfile('other', 'Other')
      context.store.getState().selectProfile('other')
    }
    if (change === 'dispose') {
      service.dispose()
    }
    expect(await pending).toMatchObject({
      status: 'unavailable',
      error: expect.stringContaining('cancelled') as unknown
    })
    expect(signal.aborted).toBeTrue()
    const before = context.store.getState().main.accounts[address].safe
    observe({ owners: [address], threshold: 1, nonce: '100' }, '999')
    expect(context.store.getState().main.accounts[address].safe).toBe(before)
  }
})
