const currentAccount = jest.fn()
const providerSend = jest.fn()
const flashQuote = jest.fn()
const flashSubmitOrder = jest.fn()
const getState = jest.fn()
const initOrigin = jest.fn()
const closeWindow = jest.fn()

jest.mock('../../../main/accounts', () => ({ default: { current: currentAccount } }))
jest.mock('../../../main/provider', () => ({ default: { send: providerSend } }))
jest.mock('../../../main/flash/instance', () => ({
  flashService: { quote: flashQuote, submitOrder: flashSubmitOrder }
}))
jest.mock('../../../main/store', () => ({ default: { getState } }))
jest.mock('../../../main/windows', () => ({ default: { close: closeWindow } }))

let closeOwnSideTrayWindow: typeof import('../../../main/operations/sideTrayWorkflows').closeOwnSideTrayWindow
let quoteFlashForCurrentAccount: typeof import('../../../main/operations/dappWorkflows').quoteFlashForCurrentAccount
let signCurrentAccountTypedData: typeof import('../../../main/operations/dappWorkflows').signCurrentAccountTypedData
let submitCurrentAccountTransaction: typeof import('../../../main/operations/dappWorkflows').submitCurrentAccountTransaction
let submitFlashForCurrentAccount: typeof import('../../../main/operations/dappWorkflows').submitFlashForCurrentAccount

const address = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'

beforeAll(async () => {
  const workflows = await import('../../../main/operations/dappWorkflows')
  const sideTrayWorkflows = await import('../../../main/operations/sideTrayWorkflows')
  closeOwnSideTrayWindow = sideTrayWorkflows.closeOwnSideTrayWindow
  quoteFlashForCurrentAccount = workflows.quoteFlashForCurrentAccount
  signCurrentAccountTypedData = workflows.signCurrentAccountTypedData
  submitCurrentAccountTransaction = workflows.submitCurrentAccountTransaction
  submitFlashForCurrentAccount = workflows.submitFlashForCurrentAccount
})

beforeEach(() => {
  currentAccount.mockReset()
  providerSend.mockReset()
  flashQuote.mockReset()
  flashSubmitOrder.mockReset()
  getState.mockReset()
  initOrigin.mockReset()
  closeWindow.mockReset()

  currentAccount.mockReturnValue({ getSelectedAddress: () => address })
  getState.mockReturnValue({
    main: { networks: { ethereum: { 1: { id: 1, on: true } } } },
    initOrigin
  })
})

describe('internal dapp workflows', () => {
  it('constructs fixed transaction RPC from the selected account', async () => {
    providerSend.mockImplementation((payload, callback) => {
      callback({ result: `0x${'a'.repeat(64)}` })
    })

    await expect(
      submitCurrentAccountTransaction({
        chainId: 1,
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        transaction: { to: target, data: '0x1234', value: '0x2' }
      })
    ).resolves.toEqual({ ok: true, transactionHash: `0x${'a'.repeat(64)}` })

    expect(initOrigin).toHaveBeenCalledWith(expect.any(String), {
      name: 'newframe-internal',
      chain: { id: 1, type: 'ethereum' }
    })

    expect(providerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        chainId: '0x1',
        _origin: expect.any(String),
        params: [
          {
            to: target,
            data: '0x1234',
            value: '0x2',
            chainId: '0x1',
            from: address
          }
        ]
      }),
      expect.any(Function)
    )
  })

  it('rejects unavailable chains before invoking a provider or Flash', async () => {
    getState.mockReturnValue({
      main: { networks: { ethereum: { 1: { id: 1, on: false } } } },
      initOrigin
    })

    await expect(
      submitCurrentAccountTransaction({
        chainId: 1,
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
        transaction: { to: target }
      })
    ).resolves.toEqual({ ok: false, error: 'provider_error', message: 'Chain is unavailable.' })
    await expect(
      signCurrentAccountTypedData({
        chainId: 1,
        typedData: { domain: {}, message: {}, primaryType: 'Order', types: { Order: [] } }
      })
    ).resolves.toEqual({ ok: false, error: 'provider_error', message: 'Chain is unavailable.' })
    await expect(quoteFlashForCurrentAccount({ chainId: 1 } as any)).resolves.toEqual({
      ok: false,
      error: 'quote_failed',
      message: 'Chain is unavailable.'
    })
    await expect(submitFlashForCurrentAccount({ chainId: 1 } as any)).resolves.toEqual({
      ok: false,
      error: 'submit_failed',
      message: 'Chain is unavailable.'
    })

    expect(providerSend).not.toHaveBeenCalled()
    expect(flashQuote).not.toHaveBeenCalled()
    expect(flashSubmitOrder).not.toHaveBeenCalled()
  })

  it('signs only v4 typed data for the selected account and requested chain', async () => {
    const typedData = {
      domain: { chainId: 1 },
      message: { amount: '1' },
      primaryType: 'Order',
      types: { Order: [] }
    }
    providerSend.mockImplementation((payload, callback) => {
      callback({ result: `0x${'b'.repeat(130)}` })
    })

    await expect(signCurrentAccountTypedData({ chainId: 1, typedData })).resolves.toEqual({
      ok: true,
      signature: `0x${'b'.repeat(130)}`
    })
    expect(providerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'eth_signTypedData_v4',
        chainId: '0x1',
        params: [address, typedData],
        _origin: expect.any(String)
      }),
      expect.any(Function)
    )

    providerSend.mockClear()
    await expect(
      signCurrentAccountTypedData({
        chainId: 10,
        typedData: { ...typedData, domain: { chainId: 1 } }
      })
    ).resolves.toEqual({ ok: false, error: 'chain_mismatch' })
    expect(providerSend).not.toHaveBeenCalled()
  })

  it('injects the selected account and chain into Flash workflows', async () => {
    const request = {
      chainId: 1,
      targetAsset: { chainId: 1 },
      contraAsset: { chainId: 1 },
      inputAmount: '1',
      orderType: 'market',
      qty: '1',
      side: 'sell'
    } as any
    flashQuote.mockResolvedValue({ quote: { id: 'quote-1' }, flash: { quoteId: 'quote-1' } })
    flashSubmitOrder.mockResolvedValue({ orderId: 'order-1' })

    await expect(quoteFlashForCurrentAccount(request)).resolves.toEqual({
      ok: true,
      quote: { id: 'quote-1' },
      flash: { quoteId: 'quote-1' }
    })
    expect(flashQuote).toHaveBeenCalledWith({
      ...request,
      accountAddress: address,
      contraChain: 1,
      targetChain: 1
    })

    const order = { ...request, quote: { id: 'quote-1' } }
    await expect(submitFlashForCurrentAccount(order)).resolves.toEqual({
      ok: true,
      orderId: 'order-1'
    })
    expect(flashSubmitOrder).toHaveBeenCalledWith({
      ...order,
      accountAddress: address,
      contraChain: 1,
      idempotencyKey: 'quote-1',
      targetChain: 1
    })
  })

  it('closes the invoking renderer only', () => {
    const event = { sender: { id: 7 } } as any

    closeOwnSideTrayWindow(event)
    expect(closeWindow).not.toHaveBeenCalled()

    jest.runOnlyPendingTimers()
    expect(closeWindow).toHaveBeenCalledWith(event)
  })
})
