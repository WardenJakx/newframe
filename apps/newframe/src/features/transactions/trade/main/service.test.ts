import { expect, it, mock } from 'bun:test'

import { FLASH_USDC_ASSET, FLASH_WETH_ASSET, getFlashAssetsForChain } from '../domain/assets'
import { FLASH_MARKET_ORDER_TYPE } from '../domain/constants'
import type { FlashQuote } from '../domain/schemas'
import type { FlashQuoteRequest, TypedDataV4 } from '../../../../app/contracts/operations'
import type { TrustedPrincipal } from '../../../access-control/main/authority'
import type { FlashSubmitOrderRequest } from './contracts'
import { createTestStore } from '../../../../../test/support/createTestStore'
import { createOperationService } from '../../../../platform/operations/service'
import { createTradeService } from './service'

const account = {
  id: 'account-1',
  address: '0x1111111111111111111111111111111111111111'
}
const owner = { clientType: 'sidetray' as const, windowInstanceId: 'trade-window' }
const principal = { kind: 'renderer' } as TrustedPrincipal
const typedData = {
  domain: { chainId: 1 },
  message: { quoteId: 'quote-1' },
  primaryType: 'Order',
  types: { Order: [] }
}
const permitTypedData = {
  domain: { chainId: 1 },
  message: { quoteId: 'quote-1' },
  primaryType: 'Permit',
  types: { Permit: [] }
}

function quote(id = 'quote-1'): FlashQuote {
  return {
    id,
    side: 'sell',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset: { ...FLASH_WETH_ASSET, chainId: 1 },
    contraAsset: { ...FLASH_USDC_ASSET, chainId: 1 },
    spentAsset: { ...FLASH_WETH_ASSET, chainId: 1 },
    receiveAsset: { ...FLASH_USDC_ASSET, chainId: 1 },
    inputAmount: '1',
    outputAmount: '2400',
    steps: [
      { id: 'approve', kind: 'approve', label: 'Approve WETH', status: 'required' },
      { id: 'sign', kind: 'sign', label: 'Sign order', status: 'required' },
      { id: 'submit', kind: 'submit', label: 'Submit order', status: 'required' }
    ],
    actions: {
      approval: {
        id: 'approval',
        kind: 'approve',
        label: 'Approve WETH',
        asset: { ...FLASH_WETH_ASSET, chainId: 1 },
        amount: '1',
        amountRaw: '1000000000000000000',
        tx: {
          chainId: 1,
          to: '0x2222222222222222222222222222222222222222',
          data: '0x095ea7b3'
        }
      }
    },
    raw: { actions: { evm: { orderTypedData: typedData, permitTypedData } }, secret: 'private' }
  }
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

it('owns private Trade execution, idempotency, revalidation, cancellation, and cleanup in main', async () => {
  let time = Date.parse('2099-01-01T00:00:00Z')
  const canonical = {
    currentAccount: account.id,
    accounts: { [account.id]: account },
    networks: { 1: { on: true }, 8453: { on: true } },
    orders: {
      'order-cancel': {
        orderId: 'order-cancel',
        accountAddress: account.address,
        spentAsset: { chainId: 8453 },
        open: true,
        cancellable: true
      }
    }
  }
  const testStore = createTestStore()
  const operations = createOperationService({ store: testStore.store, clock: { now: () => time } })
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  const flashQuote = mock(
    async (_request: unknown): Promise<{ quote: FlashQuote; flash: unknown }> => ({
      quote: quote(),
      flash: { actions: { evm: { orderTypedData: typedData, permitTypedData } }, secret: 'private' }
    })
  )
  const submitOrder = mock(async (_request: FlashSubmitOrderRequest) => ({ orderId: 'order-1' }))
  const cancelOrder = mock(async (_request: unknown) => ({}))
  const submitTransaction = mock(
    async (
      _request: unknown,
      _principal: TrustedPrincipal
    ): Promise<{ ok: true; transactionHash: string } | { ok: false; error: string; message?: string }> => ({
      ok: true as const,
      transactionHash: `0x${'a'.repeat(64)}`
    })
  )
  const signTypedData = mock(
    async ({
      typedData: value
    }: {
      typedData: TypedDataV4
    }): Promise<{ ok: true; signature: string } | { ok: false; error: string; message?: string }> => ({
      ok: true as const,
      signature: value.primaryType === 'Permit' ? '0xpermit' : '0xorder'
    })
  )
  const signMessage = mock(async (_request: unknown, _principal: TrustedPrincipal) => ({
    ok: true as const,
    signature: '0xcancel'
  }))
  const service = createTradeService({
    canonical: { snapshot: () => canonical },
    clock: { now: () => time },
    flash: { quote: flashQuote, submitOrder, cancelOrder },
    operations,
    signatures: { signMessage, signTypedData },
    transactions: { submit: submitTransaction }
  })
  const request = {
    contraAsset: { ...FLASH_USDC_ASSET, chainId: 1 },
    inputAmount: '1',
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty: '1',
    side: 'sell' as const,
    startTime: '2099-01-02T03:04:00.000Z',
    targetAsset: { ...FLASH_WETH_ASSET, chainId: 1 }
  } satisfies FlashQuoteRequest
  const prepare = (operationId: string, quoteId: string, caller = owner) =>
    service.prepare({ type: 'trade.prepare', operationId, quoteId, action: 'approve' }, principal, caller)
  const submit = (operationId: string, quoteId: string) =>
    service.submit({ type: 'trade.submit', operationId, quoteId }, principal, owner)

  const quoted = await service.quote(request, owner)
  expect(quoted.ok).toBe(true)
  expect(JSON.stringify(quoted)).not.toMatch(/private|typedData|signature|095ea7b3|"tx"|"raw"/i)
  expect(flashQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      accountAddress: account.address,
      startTime: request.startTime
    })
  )
  if (!quoted.ok) throw new Error('quote failed')
  expect(quoted.quoteId).not.toBe('quote-1')
  expect(quoted.quote).toMatchObject({ nextAction: 'approve', requiresPermit: true })

  const operationId = 'trade-operation'
  expect(prepare(operationId, quoted.quoteId)).toBe(true)
  expect(prepare(operationId, quoted.quoteId)).toBe(true)
  await flush()
  expect(submitTransaction).toHaveBeenCalledTimes(1)
  expect(operation(operationId)?.phase).toBe('awaiting_submit')
  expect(prepare(operationId, quoted.quoteId)).toBe(true)
  expect((await service.quote(request, owner)).ok).toBe(false)

  expect(submit(operationId, quoted.quoteId)).toBe(true)
  await flush()
  expect(signTypedData.mock.calls.map(([input]) => input!.typedData.primaryType)).toEqual(['Permit', 'Order'])
  expect(submitOrder.mock.calls[0]?.[0]).toMatchObject({
    idempotencyKey: operationId,
    quoteId: 'quote-1',
    orderSignature: '0xorder',
    evmPermitSignature: '0xpermit',
    startTime: request.startTime
  })
  expect(operation(operationId)).toMatchObject({
    status: 'succeeded',
    phase: 'submitted',
    entityRefs: expect.arrayContaining([
      { type: 'transaction', id: `0x${'a'.repeat(64)}` },
      { type: 'order', id: 'order-1' }
    ])
  })

  const cancel = { type: 'flash.order-cancel' as const, operationId: 'cancel-1', orderId: 'order-cancel' }
  expect(service.cancel(cancel, principal, owner)).toBe(true)
  expect(service.cancel(cancel, principal, owner)).toBe(true)
  expect(service.cancel({ ...cancel, operationId: 'cancel-2' }, principal, owner)).toBe(false)
  await flush()
  expect(signMessage.mock.calls).toEqual([
    [expect.objectContaining({ chainId: canonical.orders['order-cancel'].spentAsset.chainId }), principal]
  ])
  expect(cancelOrder).toHaveBeenCalledWith({ orderId: cancel.orderId, signature: '0xcancel' })
  expect(service.cancel(cancel, principal, owner)).toBe(true)

  const second = await service.quote(request, owner)
  if (!second.ok) throw new Error('second quote failed')
  expect(prepare('trade-stale-account', second.quoteId)).toBe(true)
  await flush()
  let resolveSignature!: (value: { ok: true; signature: string }) => void
  signTypedData.mockImplementationOnce(() => new Promise((resolve) => (resolveSignature = resolve)))
  const staleOperation = 'trade-stale-account'
  expect(submit(staleOperation, second.quoteId)).toBe(true)
  await flush()
  canonical.currentAccount = 'missing'
  resolveSignature({ ok: true, signature: '0xpermit' })
  await flush()
  expect(operation(staleOperation)).toMatchObject({ status: 'failed' })
  expect(submitOrder).toHaveBeenCalledTimes(1)

  canonical.currentAccount = account.id
  const quoteFor = async (id: string) => {
    flashQuote.mockImplementationOnce(async () => ({ quote: quote(id), flash: quote(id).raw }))
    const result = await service.quote(request, owner)
    if (!result.ok) throw new Error(`quote failed: ${id}`)
    return result
  }

  const crossOwner = await quoteFor('quote-cross-owner')
  const otherOwner = { ...owner, windowInstanceId: 'other-window' }
  const txCountBeforeReplay = submitTransaction.mock.calls.length
  expect(prepare('cross-owner-replay', crossOwner.quoteId, otherOwner)).toBe(true)
  await flush()
  expect(submitTransaction).toHaveBeenCalledTimes(txCountBeforeReplay)
  expect(operation('cross-owner-replay')?.status).toBe('failed')

  const expiring = await quoteFor('quote-expired')
  time += 61_000
  expect(prepare('expired-prepare', expiring.quoteId)).toBe(true)
  await flush()
  expect(operation('expired-prepare')).toMatchObject({ status: 'failed' })

  const unavailable = await quoteFor('quote-network-off')
  canonical.networks[1].on = false
  expect(prepare('network-off-prepare', unavailable.quoteId)).toBe(true)
  await flush()
  expect(operation('network-off-prepare')).toMatchObject({ status: 'failed' })
  canonical.networks[1].on = true

  const txFailure = await quoteFor('quote-tx-failure')
  submitTransaction.mockImplementationOnce(async () => ({
    ok: false as const,
    error: 'provider_error',
    message: 'Transaction rejected.'
  }))
  expect(prepare('tx-failure', txFailure.quoteId)).toBe(true)
  await flush()
  expect(operation('tx-failure')).toMatchObject({ status: 'failed' })

  const signFailure = await quoteFor('quote-sign-failure')
  expect(prepare('sign-failure', signFailure.quoteId)).toBe(true)
  await flush()
  signTypedData.mockImplementationOnce(async () => ({
    ok: false as const,
    error: 'provider_error',
    message: 'Signing rejected.'
  }))
  const submitCountBeforeSignFailure = submitOrder.mock.calls.length
  expect(submit('sign-failure', signFailure.quoteId)).toBe(true)
  await flush()
  expect(submitOrder).toHaveBeenCalledTimes(submitCountBeforeSignFailure)
  expect(operation('sign-failure')).toMatchObject({ status: 'failed' })

  const flashFailure = await quoteFor('quote-flash-failure')
  expect(prepare('flash-failure', flashFailure.quoteId)).toBe(true)
  await flush()
  submitOrder.mockImplementationOnce(async () => {
    throw new Error('Flash unavailable')
  })
  expect(submit('flash-failure', flashFailure.quoteId)).toBe(true)
  await flush()
  expect(operation('flash-failure')).toMatchObject({ status: 'failed' })

  let resolveCancelRevalidation!: (value: { ok: true; signature: string }) => void
  signMessage.mockImplementationOnce(() => new Promise((resolve) => (resolveCancelRevalidation = resolve)))
  expect(
    service.cancel(
      { type: 'flash.order-cancel', operationId: 'cancel-stale', orderId: 'order-cancel' },
      principal,
      owner
    )
  ).toBe(true)
  await Promise.resolve()
  canonical.orders['order-cancel'].cancellable = false
  const cancelCountBeforeStale = cancelOrder.mock.calls.length
  resolveCancelRevalidation({ ok: true, signature: '0xcancel-stale' })
  await flush()
  expect(cancelOrder).toHaveBeenCalledTimes(cancelCountBeforeStale)
  expect(operation('cancel-stale')).toMatchObject({ status: 'failed' })
  canonical.orders['order-cancel'].cancellable = true

  let resolveLateQuote!: (value: { quote: FlashQuote; flash: unknown }) => void
  flashQuote.mockImplementationOnce(() => new Promise((resolve) => (resolveLateQuote = resolve)))
  const pendingQuote = service.quote(request, owner)
  await Promise.resolve()
  service.release(owner)
  resolveLateQuote({ quote: quote('late'), flash: {} })
  expect((await pendingQuote).ok).toBe(false)

  const pending = await quoteFor('quote-dispose')
  let resolveTransaction!: (value: { ok: true; transactionHash: string }) => void
  let resolveCancel!: (value: { ok: true; signature: string }) => void
  submitTransaction.mockImplementationOnce(() => new Promise((resolve) => (resolveTransaction = resolve)))
  signMessage.mockImplementationOnce(() => new Promise((resolve) => (resolveCancel = resolve)))
  expect(prepare('pending-dispose-trade', pending.quoteId)).toBe(true)
  expect(
    service.cancel(
      { type: 'flash.order-cancel', operationId: 'pending-dispose-cancel', orderId: 'order-cancel' },
      principal,
      owner
    )
  ).toBe(true)
  await Promise.resolve()
  service.dispose()
  expect(operation('pending-dispose-trade')).toMatchObject({ status: 'failed' })
  expect(operation('pending-dispose-cancel')).toMatchObject({ status: 'failed' })
  resolveTransaction({ ok: true, transactionHash: `0x${'b'.repeat(64)}` })
  resolveCancel({ ok: true, signature: '0xcancel-after-dispose' })
  await flush()
  expect(prepare(operationId, quoted.quoteId)).toBe(false)
})

it('keeps cross-chain provider state private and validates both networks and the spent chain', async () => {
  let time = Date.parse('2099-01-01T00:00:00Z')
  const targetAsset = getFlashAssetsForChain(1).find((asset) => asset.symbol === 'WETH')!
  const contraAsset = getFlashAssetsForChain(8453).find((asset) => asset.symbol === 'USDC')!
  const canonical = {
    currentAccount: account.id,
    accounts: { [account.id]: account },
    networks: { 1: { on: true }, 8453: { on: true } },
    orders: {}
  }
  const testStore = createTestStore()
  const operations = createOperationService({ store: testStore.store, clock: { now: () => time } })
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  const crossQuote = ({
    actionChainId,
    orderChainId = 8453
  }: {
    actionChainId?: number
    orderChainId?: number
  } = {}): FlashQuote => ({
    id: '',
    side: 'buy',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset,
    contraAsset,
    spentAsset: contraAsset,
    receiveAsset: targetAsset,
    inputAmount: '100',
    outputAmount: '0.04',
    steps: [
      ...(actionChainId
        ? [{ id: 'approve', kind: 'approve' as const, label: 'Approve USDC', status: 'required' as const }]
        : []),
      { id: 'sign', kind: 'sign', label: 'Sign order', status: 'required' },
      { id: 'submit', kind: 'submit', label: 'Submit trade', status: 'required' }
    ],
    ...(actionChainId
      ? {
          actions: {
            approval: {
              id: 'approve',
              kind: 'approve',
              label: 'Approve USDC',
              asset: contraAsset,
              amount: '100',
              amountRaw: '100000000',
              tx: {
                chainId: actionChainId,
                to: contraAsset.address,
                data: '0x095ea7b3'
              }
            }
          }
        }
      : {}),
    raw: {
      quoteId: '',
      bridgeQuoteId: 'bridge-private',
      evm: {
        orderTypedData: {
          domain: { chainId: orderChainId },
          message: { toToken: '0x000000000000000000000000000000000DEFdeaD' },
          primaryType: 'Order',
          types: { Order: [] }
        }
      }
    }
  })
  const flashQuote = mock(async () => ({ quote: crossQuote(), flash: crossQuote().raw }))
  const submitOrder = mock(async (_request: FlashSubmitOrderRequest) => ({ orderId: 'cross-order' }))
  const signTypedData = mock(async () => ({ ok: true as const, signature: '0xorder' }))
  const submitTransaction = mock(async () => ({
    ok: true as const,
    transactionHash: `0x${'c'.repeat(64)}`
  }))
  const service = createTradeService({
    canonical: { snapshot: () => canonical },
    clock: { now: () => time },
    flash: { quote: flashQuote, submitOrder, cancelOrder: async () => ({}) },
    operations,
    signatures: {
      signMessage: async () => ({ ok: true, signature: '0xcancel' }),
      signTypedData
    },
    transactions: { submit: submitTransaction }
  })
  const request = {
    contraAsset,
    inputAmount: '100',
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty: '100',
    side: 'buy' as const,
    targetAsset
  } satisfies FlashQuoteRequest

  const quoted = await service.quote(
    {
      ...request,
      recipientAddress: '0x9999999999999999999999999999999999999999'
    } as FlashQuoteRequest,
    owner
  )
  expect(quoted.ok).toBe(true)
  if (!quoted.ok) throw new Error('cross-chain quote failed')
  expect(quoted.quoteId).not.toBe('bridge-private')
  expect(quoted.quote.id).toBe(quoted.quoteId)
  expect(JSON.stringify(quoted)).not.toContain('bridge-private')
  expect((flashQuote.mock.calls[0] as unknown as [unknown])[0]).toEqual({
    ...request,
    accountAddress: account.address,
    recipientAddress: account.address,
    contraChain: 8453,
    targetChain: 1
  })
  expect(
    service.submit(
      { type: 'trade.submit', operationId: 'cross-submit', quoteId: quoted.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(signTypedData.mock.calls[0] as unknown[]).toEqual([
    expect.objectContaining({ chainId: 8453 }),
    principal
  ])
  expect(submitOrder.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      accountAddress: account.address,
      recipientAddress: account.address,
      bridgeQuoteId: 'bridge-private',
      idempotencyKey: 'cross-submit'
    })
  )
  expect(submitOrder.mock.calls[0]?.[0]).not.toHaveProperty('quoteId')
  expect(operation('cross-submit')).toMatchObject({
    status: 'succeeded',
    entityRefs: expect.arrayContaining([
      { type: 'chain', id: '1' },
      { type: 'chain', id: '8453' }
    ])
  })

  const unavailable = await service.quote(request, owner)
  if (!unavailable.ok) throw new Error('unavailable quote setup failed')
  canonical.networks[1].on = false
  const signCount = signTypedData.mock.calls.length
  expect(
    service.submit(
      { type: 'trade.submit', operationId: 'network-invalidated', quoteId: unavailable.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operation('network-invalidated')).toMatchObject({ status: 'failed' })
  expect(signTypedData.mock.calls).toHaveLength(signCount)
  canonical.networks[1].on = true

  let resolveLateQuote!: (value: { quote: FlashQuote; flash: unknown }) => void
  flashQuote.mockImplementationOnce(() => new Promise((resolve) => (resolveLateQuote = resolve)))
  const late = service.quote(request, owner)
  await Promise.resolve()
  canonical.networks[8453].on = false
  resolveLateQuote({ quote: crossQuote(), flash: crossQuote().raw })
  expect((await late).ok).toBe(false)
  canonical.networks[8453].on = true

  expect(
    (await service.quote({ ...request, orderType: 'limit', limitNotionalPrice: '2400' }, owner)).ok
  ).toBe(false)
  expect(flashQuote.mock.calls).toHaveLength(3)

  flashQuote.mockImplementationOnce(async () => ({
    quote: crossQuote({ orderChainId: 1 }),
    flash: crossQuote({ orderChainId: 1 }).raw
  }))
  const typedMismatch = await service.quote(request, owner)
  if (!typedMismatch.ok) throw new Error('typed mismatch quote setup failed')
  expect(
    service.submit(
      { type: 'trade.submit', operationId: 'typed-mismatch', quoteId: typedMismatch.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operation('typed-mismatch')).toMatchObject({ status: 'failed' })

  flashQuote.mockImplementationOnce(async () => ({
    quote: crossQuote({ actionChainId: 1 }),
    flash: crossQuote({ actionChainId: 1 }).raw
  }))
  const actionMismatch = await service.quote(request, owner)
  if (!actionMismatch.ok) throw new Error('action mismatch quote setup failed')
  const txCount = submitTransaction.mock.calls.length
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'action-mismatch',
        quoteId: actionMismatch.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operation('action-mismatch')).toMatchObject({ status: 'failed' })
  expect(submitTransaction.mock.calls).toHaveLength(txCount)
  service.dispose()
  time += 1
})
