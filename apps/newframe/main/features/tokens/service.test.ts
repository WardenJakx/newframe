import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../test/support/createTestStore'
import { createOperationService } from '../operations/service'
import { createTokenService } from './service'

const address = '0x1111111111111111111111111111111111111111'
const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'tray-test' }

describe('token mutation service', () => {
  it('preserves custom upsert semantics and records safe add completion while removal uses canonical truth', async () => {
    const store = createTestStore()
    const operations = createOperationService({ store: store.store, clock: { now: () => 1 } })
    const lookup = mock(async (_address: string, _chainId: number) => ({
      decimals: 18,
      name: 'Token',
      symbol: 'TKN',
      totalSupply: '1000'
    }))
    const service = createTokenService({ lookup, operations, store: store.store })
    const token = { address, chainId: 99, decimals: 18, logoURI: '', name: 'Token', symbol: 'TKN' }

    expect(await service.lookup(address, 99)).toMatchObject({ symbol: 'TKN' })
    expect(lookup.mock.calls).toEqual([[address, 99]])

    expect(service.add({ type: 'token.add', operationId: 'add-token', token }, owner)).toBeTrue()
    expect(store.getState().main.tokens.byId[`99:${address}`]).toMatchObject({ ...token, custom: true })
    expect(store.getState().operations['add-token'].operation).toMatchObject({
      status: 'succeeded',
      phase: 'completed',
      entityRefs: [{ type: 'token', id: `99:${address}` }]
    })
    expect(service.add({ type: 'token.add', operationId: 'add-token', token }, owner)).toBeTrue()
    expect(
      service.add(
        {
          type: 'token.add',
          operationId: 'add-token',
          token: { ...token, name: 'Different token' }
        },
        owner
      )
    ).toBeFalse()
    expect(store.getState().main.tokens.byId[`99:${address}`].name).toBe('Token')
    expect(service.remove({ address: address.toUpperCase(), chainId: 99 })).toBeTrue()
    expect(store.getState().main.tokens.byId[`99:${address}`].custom).toBeFalse()
    expect(service.remove({ address, chainId: 1 })).toBeFalse()
  })
})
