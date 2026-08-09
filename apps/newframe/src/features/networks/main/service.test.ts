import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createNetworkService } from './service'

describe('network mutation service', () => {
  it('verifies activation and RPC preconditions before canonical mutation', async () => {
    const store = createTestStore({
      main: {
        networks: {
          ethereum: {
            1: {
              id: 1,
              type: 'ethereum',
              on: true,
              connection: {
                primary: { current: 'local', custom: '', on: false },
                secondary: { current: 'local', custom: '', on: false }
              }
            },
            10: { id: 10, type: 'ethereum', on: true },
            20: { id: 20, type: 'ethereum', on: true }
          }
        }
      }
    })
    const rpcMatchesChain = mock(async (_url: unknown, _chainId: number) => true)
    const service = createNetworkService({ rpcMatchesChain, store: store.store })

    expect(service.setActivation(99, true)).toBeFalse()
    expect(service.remove(99)).toBeFalse()
    expect(service.remove(1)).toBeFalse()
    expect(service.remove(20)).toBeTrue()
    expect(store.getState().main.networks.ethereum[20]).toBeUndefined()
    expect(service.setActivation(1, false)).toBeFalse()
    expect(service.setActivation(10, false)).toBeTrue()
    expect(store.getState().main.networks.ethereum[10].on).toBeFalse()
    expect(await service.setPrimaryRpc(99, 'https://rpc.invalid')).toBeFalse()
    expect(await service.setPrimaryRpc(1, 'https://rpc.example')).toBeTrue()
    expect(rpcMatchesChain.mock.calls).toEqual([['https://rpc.example', 1]])
    expect(store.getState().main.networks.ethereum[1].connection.primary).toMatchObject({
      current: 'custom',
      custom: 'https://rpc.example',
      on: true
    })
  })
})
