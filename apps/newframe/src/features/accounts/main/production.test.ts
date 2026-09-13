import { describe, expect, it, mock } from 'bun:test'

import { createAccountSelectionAdapter, createAddressChainUsageAdapter } from './production'

const address = '0x1111111111111111111111111111111111111111'

const state = {
  main: {
    networks: {
      ethereum: {
        1: { id: 1, type: 'ethereum', on: true }
      }
    }
  }
}

describe('address chain usage infrastructure adapter', () => {
  it('settles each RPC once and reports transaction usage', async () => {
    type ChainResponse = { error?: unknown; result?: unknown }
    let respond: (response: ChainResponse) => void = () => undefined
    const send = mock((_request: unknown, callback: (response: ChainResponse) => void) => {
      respond = callback
    })
    const adapter = createAddressChainUsageAdapter({ send } as never, {
      getState: () => state as never
    })

    const pending = adapter([address])
    respond({ result: '0x1' })
    respond({ error: { message: 'late failure' } })

    expect(pending).resolves.toEqual([{ address, chainIds: [1], complete: true }])
    expect(send.mock.calls).toHaveLength(1)
    adapter.dispose()
  })

  it('rejects an in-flight RPC when the adapter is disposed', async () => {
    const adapter = createAddressChainUsageAdapter({ send: mock(() => undefined) } as never, {
      getState: () => state as never
    })
    const pending = adapter([address])

    adapter.dispose()

    expect(pending).rejects.toThrow('disposed before the operation completed')
  })
})

describe('account selection infrastructure adapter', () => {
  it('translates the legacy callback once and publishes changed selected addresses', async () => {
    const account = { id: 'selected' }
    const getSelectedAddresses = mock(() => ['previous'])
    getSelectedAddresses.mockReturnValueOnce(['previous']).mockReturnValueOnce(['selected'])
    const setSigner = mock((_id: string, done: (error: Error | null, value?: unknown) => void) =>
      done(null, account)
    )
    const accountsChanged = mock(() => undefined)
    const adapter = createAccountSelectionAdapter(
      { getSelectedAddresses, setSigner } as never,
      { accountsChanged } as never
    )

    expect(adapter('selected')).resolves.toBe(account)
    expect(setSigner).toHaveBeenCalledWith('selected', expect.any(Function))
    expect(accountsChanged).toHaveBeenCalledWith(['selected'])
    adapter.dispose()
  })

  it('does not publish unchanged selection and rejects callback failures', async () => {
    const failure = new Error('could not set signer')
    const getSelectedAddresses = mock(() => ['selected'])
    const accountsChanged = mock(() => undefined)
    const adapter = createAccountSelectionAdapter(
      {
        getSelectedAddresses,
        setSigner: mock((_id: string, done: (error: Error) => void) => done(failure))
      } as never,
      { accountsChanged } as never
    )

    expect(adapter('missing')).rejects.toBe(failure)
    expect(accountsChanged).not.toHaveBeenCalled()
    adapter.dispose()
  })
})
