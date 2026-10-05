import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore.ts'
import { createChainsStatePort, createLegacyChainMutations } from '../../../app/main/composition/chains.ts'
import { createBuiltInChains } from '../../../features/chains/domain/chain/catalog.ts'
import { createInternet } from '../../../platform/internet/index.ts'
import { createChainsService } from './service.ts'

describe('chain mutation service', () => {
  it('verifies activation and RPC preconditions before canonical mutation', async () => {
    const builtIns = createBuiltInChains()
    const mainnet = builtIns[1]
    const optimism = builtIns[10]
    const store = createTestStore({
      main: {
        chains: {
          ethereum: {
            1: {
              ...mainnet,
              connection: {
                primary: { ...mainnet.connection.primary, current: 'local', custom: '', on: false },
                secondary: { ...mainnet.connection.secondary, current: 'local', custom: '', on: false }
              }
            },
            10: optimism,
            20: { ...optimism, id: 20, name: 'Removable test chain' }
          }
        }
      }
    })
    const rpcMatchesChain = mock(async (_url: unknown, _chainId: number) => true)
    const internet = createInternet(fetch)
    const { service } = createChainsService({
      rpcMatchesChain,
      state: createChainsStatePort(store.store),
      legacyMutations: createLegacyChainMutations(store.store),
      internet: {
        isOpen: internet.isOpen,
        subscribe: (listener) => internet.subscribe(listener),
        request: internet.request,
        openWebSocket: (url, options) => internet.openWebSocket(url, options)
      }
    })

    expect(service.setActivation(99, true)).toBeFalse()
    expect(service.remove(99)).toBeFalse()
    expect(service.remove(1)).toBeFalse()
    expect(service.remove(20)).toBeTrue()
    expect(store.getState().main.chains.ethereum[20]).toBeUndefined()
    expect(service.setActivation(1, false)).toBeFalse()
    expect(service.setActivation(10, false)).toBeTrue()
    expect(store.getState().main.chains.ethereum[10].on).toBeFalse()
    expect(await service.setPrimaryRpc(99, 'https://rpc.invalid')).toBeFalse()
    expect(await service.setPrimaryRpc(1, 'https://rpc.example')).toBeTrue()
    expect(rpcMatchesChain.mock.calls).toEqual([['https://rpc.example', 1]])
    expect(store.getState().main.chains.ethereum[1].connection.primary).toMatchObject({
      current: 'custom',
      custom: 'https://rpc.example',
      on: true
    })
  })
})
