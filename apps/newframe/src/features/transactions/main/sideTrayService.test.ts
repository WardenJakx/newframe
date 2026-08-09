import { beforeEach, describe, expect, it, mock } from 'bun:test'

const currentAccount = mock()
const providerSend = mock()
const initOrigin = mock()

import { createRendererPrincipal } from '../../access-control/main/authority'
import { createSideTrayTransactionService } from './sideTrayService'

let service: ReturnType<typeof createSideTrayTransactionService>
let chainAvailable = true

const address = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'
const principal = createRendererPrincipal({
  clientType: 'sidetray',
  entrypoint: 'sidetray',
  webContentsId: 1,
  windowInstanceId: 'side-tray-test'
})

beforeEach(() => {
  currentAccount.mockReset()
  providerSend.mockReset()
  initOrigin.mockReset()
  chainAvailable = true

  currentAccount.mockReturnValue({ getSelectedAddress: () => address })
  service = createSideTrayTransactionService({
    provider: { request: providerSend },
    accounts: { current: currentAccount },
    store: {
      getState: () => ({
        main: { networks: { ethereum: { 1: { id: 1, on: chainAvailable } } } },
        initOrigin
      })
    },
    now: () => 42
  })
})

describe('side tray transaction service', () => {
  it('constructs fixed transaction RPC from the selected account', async () => {
    providerSend.mockResolvedValue({ result: `0x${'a'.repeat(64)}` })

    await expect(
      service.submitCurrentAccountTransaction(
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
      principal
    )
  })

  it('passes canonical token metadata through the trusted transaction context', async () => {
    providerSend.mockResolvedValue({ result: `0x${'a'.repeat(64)}` })
    const tokenData = { decimals: 6, name: 'USD Coin', symbol: 'USDC' }

    await service.submitCurrentAccountTransaction(
      {
        chainId: 1,
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
        tokenData,
        transaction: { to: target, data: '0x1234', value: '0x0' }
      },
      principal
    )

    expect(providerSend).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
      principal,
      { tokenData }
    )
  })

  it('rejects unavailable chains before invoking a provider or Flash', async () => {
    chainAvailable = false

    await expect(
      service.submitCurrentAccountTransaction(
        {
          chainId: 1,
          idempotencyKey: '00000000-0000-4000-8000-000000000002',
          transaction: { to: target }
        },
        principal
      )
    ).resolves.toEqual({ ok: false, error: 'provider_error', message: 'Chain is unavailable.' })
    await expect(
      service.signCurrentAccountTypedData(
        {
          chainId: 1,
          typedData: { domain: {}, message: {}, primaryType: 'Order', types: { Order: [] } }
        },
        principal
      )
    ).resolves.toEqual({ ok: false, error: 'provider_error', message: 'Chain is unavailable.' })
    expect(providerSend).not.toHaveBeenCalled()
  })

  it('signs only v4 typed data for the selected account and requested chain', async () => {
    const typedData = {
      domain: { chainId: 1 },
      message: { amount: '1' },
      primaryType: 'Order',
      types: { Order: [] }
    }
    providerSend.mockResolvedValue({ result: `0x${'b'.repeat(130)}` })

    await expect(service.signCurrentAccountTypedData({ chainId: 1, typedData }, principal)).resolves.toEqual({
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
      principal
    )

    providerSend.mockClear()
    await expect(
      service.signCurrentAccountTypedData(
        {
          chainId: 10,
          typedData: { ...typedData, domain: { chainId: 1 } }
        },
        principal
      )
    ).resolves.toEqual({ ok: false, error: 'chain_mismatch' })
    expect(providerSend).not.toHaveBeenCalled()
  })
})
