import { afterEach, beforeAll, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

const currentAccount = mock()
const providerSend = mock()
const flashQuote = mock()
const flashSubmitOrder = mock()
const getState = mock()
const initOrigin = mock()
const closeWindow = mock()

import { createRendererPrincipal } from '../../../main/authority'

mock.module('../../../main/accounts', () => ({ default: { current: currentAccount } }))
mock.module('../../../main/provider', () => ({ default: { send: providerSend } }))
mock.module('../../../main/flash/instance', () => ({
  flashService: { quote: flashQuote, submitOrder: flashSubmitOrder }
}))
mock.module('../../../main/store', () => ({ default: { getState } }))
mock.module('../../../main/windows', () => ({ default: { close: closeWindow } }))

let closeOwnSideTray: typeof import('../../../main/operations/sideTrayWorkflows').closeOwnSideTray
let quoteFlashForCurrentAccount: typeof import('../../../main/operations/sideTrayTransactions').quoteFlashForCurrentAccount
let signCurrentAccountTypedData: typeof import('../../../main/operations/sideTrayTransactions').signCurrentAccountTypedData
let submitCurrentAccountTransaction: typeof import('../../../main/operations/sideTrayTransactions').submitCurrentAccountTransaction
let submitFlashForCurrentAccount: typeof import('../../../main/operations/sideTrayTransactions').submitFlashForCurrentAccount

const address = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'
const principal = createRendererPrincipal({
  clientType: 'sidetray',
  entrypoint: 'sidetray',
  webContentsId: 1,
  windowInstanceId: 'side-tray-test'
})

beforeAll(async () => {
  const workflows = await import('../../../main/operations/sideTrayTransactions')
  const sideTrayWorkflows = await import('../../../main/operations/sideTrayWorkflows')
  closeOwnSideTray = sideTrayWorkflows.closeOwnSideTray
  quoteFlashForCurrentAccount = workflows.quoteFlashForCurrentAccount
  signCurrentAccountTypedData = workflows.signCurrentAccountTypedData
  submitCurrentAccountTransaction = workflows.submitCurrentAccountTransaction
  submitFlashForCurrentAccount = workflows.submitFlashForCurrentAccount
})

beforeEach(() => {
  timers.useFakeTimers()
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

afterEach(() => {
  timers.useRealTimers()
})

describe('side tray transaction workflows', () => {
  it('constructs fixed transaction RPC from the selected account', async () => {
    providerSend.mockImplementation((payload, callback) => {
      callback({ result: `0x${'a'.repeat(64)}` })
    })

    await expect(
      submitCurrentAccountTransaction(
        {
          chainId: 1,
          idempotencyKey: '00000000-0000-4000-8000-000000000001',
          transaction: { to: target, data: '0x1234', value: '0x2' }
        },
        principal
      )
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
      expect.any(Function),
      principal
    )
  })

  it('rejects unavailable chains before invoking a provider or Flash', async () => {
    getState.mockReturnValue({
      main: { networks: { ethereum: { 1: { id: 1, on: false } } } },
      initOrigin
    })

    await expect(
      submitCurrentAccountTransaction(
        {
          chainId: 1,
          idempotencyKey: '00000000-0000-4000-8000-000000000002',
          transaction: { to: target }
        },
        principal
      )
    ).resolves.toEqual({ ok: false, error: 'provider_error', message: 'Chain is unavailable.' })
    await expect(
      signCurrentAccountTypedData(
        {
          chainId: 1,
          typedData: { domain: {}, message: {}, primaryType: 'Order', types: { Order: [] } }
        },
        principal
      )
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

    await expect(signCurrentAccountTypedData({ chainId: 1, typedData }, principal)).resolves.toEqual({
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
      expect.any(Function),
      principal
    )

    providerSend.mockClear()
    await expect(
      signCurrentAccountTypedData(
        {
          chainId: 10,
          typedData: { ...typedData, domain: { chainId: 1 } }
        },
        principal
      )
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

    await expect(quoteFlashForCurrentAccount(request)).resolves.toMatchObject({
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

    closeOwnSideTray(event)
    expect(closeWindow).not.toHaveBeenCalled()

    timers.runOnlyPendingTimers()
    expect(closeWindow).toHaveBeenCalledWith(event)
  })
})
