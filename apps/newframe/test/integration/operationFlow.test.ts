import { expect, it } from 'bun:test'

import { createOperationService } from '../../src/platform/operations/service'
import { createTokenService } from '../../src/features/tokens/main/service'
import { createOperationDispatcher, type OperationServices } from '../../src/platform/ipc/main/operations'
import { projectRendererState } from '../../src/platform/state-sync/main/projections'
import createInitialState from '../../src/platform/state-store/state'
import { createTestStore } from '../support/createTestStore'

const owner = { clientType: 'wallet-ui', entrypoint: 'tray', windowInstanceId: 'wallet-window' } as const

it('acknowledges a real command and projects its completion only to the owning window', async () => {
  const store = createTestStore(createInitialState())
  const operations = createOperationService({ store: store.store, clock: { now: () => 10 } })
  const tokens = createTokenService({ lookup: async () => undefined, operations, store: store.store })
  const services = {
    accounts: { current: () => null, get: () => undefined },
    accountMutations: {} as OperationServices['accountMutations'],
    accountOnboarding: {} as OperationServices['accountOnboarding'],
    agent: {} as OperationServices['agent'],
    networks: {} as OperationServices['networks'],
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
    authorizeRenderer: () => ({ ...owner, webContentsId: 1 }),
    createRendererPrincipal: (() => undefined) as never,
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
    owned: projectRendererState(store.getState(), owner).operations['add-token'],
    otherWindow: projectRendererState(store.getState(), {
      clientType: 'wallet-ui',
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
