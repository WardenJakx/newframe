import { expect, it, mock } from 'bun:test'

import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../domain/flash/assets'
import { FLASH_MARKET_ORDER_TYPE } from '../../../domain/flash/constants'
import type { FlashQuote } from '../../../domain/flash/schemas'
import type { FlashQuoteRequest, TypedDataV4 } from '../../../contracts/operations'
import type { OperationRecord } from '../../../domain/state/operation'
import type { TrustedPrincipal } from '../../authority'
import type { FlashSubmitOrderRequest } from '../../flash/contracts'
import type { OperationService } from '../operations/service'
import type { OperationReference } from '../operations/types'
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

function operationService(now: () => number) {
  const records = new Map<string, { owner: typeof owner; operation: OperationRecord }>()
  const key = (reference: OperationReference) => reference.id
  const service: OperationService = {
    start(input) {
      if (!input.id || records.has(input.id)) throw new Error('duplicate')
      const operation: OperationRecord = {
        id: input.id,
        type: input.type,
        status: 'pending',
        phase: input.phase,
        entityRefs: input.entityRefs,
        startedAt: now(),
        updatedAt: now()
      }
      records.set(input.id, { owner: input.owner as typeof owner, operation })
      return operation
    },
    advance(reference, update) {
      const entry = records.get(key(reference))
      if (!entry || entry.operation.status !== 'pending') return entry?.operation
      entry.operation = { ...entry.operation, ...update, updatedAt: now() }
      return entry.operation
    },
    complete(reference, phase) {
      const entry = records.get(key(reference))
      if (!entry || entry.operation.status !== 'pending') return entry?.operation
      entry.operation = {
        ...entry.operation,
        status: 'succeeded',
        phase,
        updatedAt: now(),
        finishedAt: now()
      }
      return entry.operation
    },
    fail(reference, error, phase) {
      const entry = records.get(key(reference))
      if (!entry || entry.operation.status !== 'pending') return entry?.operation
      const candidate = error as { code?: string; message?: string }
      entry.operation = {
        ...entry.operation,
        status: 'failed',
        phase,
        error: { code: candidate.code || 'trade_failed', message: candidate.message || 'Trade failed.' },
        updatedAt: now(),
        finishedAt: now()
      }
      return entry.operation
    },
    lookup(reference) {
      const entry = records.get(key(reference))
      return entry?.owner.clientType === reference.owner.clientType &&
        entry.owner.windowInstanceId === reference.owner.windowInstanceId &&
        entry.operation.type === reference.type
        ? entry.operation
        : undefined
    }
  }
  return { records, service }
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
    networks: { 1: { on: true } },
    orders: {
      'order-cancel': {
        orderId: 'order-cancel',
        accountAddress: account.address,
        chainId: 1,
        open: true,
        cancellable: true
      }
    }
  }
  const operations = operationService(() => time)
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
    operations: operations.service,
    signatures: { signMessage, signTypedData },
    transactions: { submit: submitTransaction }
  })
  const request = {
    chainId: 1,
    contraAsset: { ...FLASH_USDC_ASSET, chainId: 1 },
    inputAmount: '1',
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty: '1',
    side: 'sell' as const,
    startTime: '2099-01-02T03:04:00.000Z',
    targetAsset: { ...FLASH_WETH_ASSET, chainId: 1 }
  } satisfies FlashQuoteRequest

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
  expect(quoted.quote).toMatchObject({ nextAction: 'approve', requiresPermit: true })

  const prepare = {
    type: 'trade.prepare' as const,
    operationId: 'trade-operation',
    quoteId: quoted.quoteId,
    action: 'approve' as const
  }
  expect(service.prepare(prepare, principal, owner)).toBe(true)
  expect(service.prepare(prepare, principal, owner)).toBe(true)
  await flush()
  expect(submitTransaction).toHaveBeenCalledTimes(1)
  expect(operations.records.get(prepare.operationId)?.operation.phase).toBe('awaiting_submit')
  expect(service.prepare(prepare, principal, owner)).toBe(true)
  expect((await service.quote(request, owner)).ok).toBe(false)

  expect(
    service.submit(
      { type: 'trade.submit', operationId: prepare.operationId, quoteId: quoted.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(signTypedData.mock.calls.map(([input]) => input!.typedData.primaryType)).toEqual(['Permit', 'Order'])
  expect(submitOrder.mock.calls[0]?.[0]).toMatchObject({
    idempotencyKey: prepare.operationId,
    orderSignature: '0xorder',
    evmPermitSignature: '0xpermit',
    startTime: request.startTime
  })
  expect(operations.records.get(prepare.operationId)?.operation).toMatchObject({
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
  expect(signMessage).toHaveBeenCalledTimes(1)
  expect(cancelOrder).toHaveBeenCalledWith({ orderId: cancel.orderId, signature: '0xcancel' })
  expect(service.cancel(cancel, principal, owner)).toBe(true)

  const second = await service.quote(request, owner)
  if (!second.ok) throw new Error('second quote failed')
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'trade-stale-account',
        quoteId: second.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  let resolveSignature!: (value: { ok: true; signature: string }) => void
  signTypedData.mockImplementationOnce(() => new Promise((resolve) => (resolveSignature = resolve)))
  const staleOperation = 'trade-stale-account'
  expect(
    service.submit(
      { type: 'trade.submit', operationId: staleOperation, quoteId: second.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  canonical.currentAccount = 'missing'
  resolveSignature({ ok: true, signature: '0xpermit' })
  await flush()
  expect(operations.records.get(staleOperation)?.operation).toMatchObject({ status: 'failed' })
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
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'cross-owner-replay',
        quoteId: crossOwner.quoteId,
        action: 'approve'
      },
      principal,
      otherOwner
    )
  ).toBe(true)
  await flush()
  expect(submitTransaction).toHaveBeenCalledTimes(txCountBeforeReplay)
  expect(operations.records.get('cross-owner-replay')?.operation.status).toBe('failed')

  const expiring = await quoteFor('quote-expired')
  time += 61_000
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'expired-prepare',
        quoteId: expiring.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operations.records.get('expired-prepare')?.operation).toMatchObject({ status: 'failed' })

  const unavailable = await quoteFor('quote-network-off')
  canonical.networks[1].on = false
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'network-off-prepare',
        quoteId: unavailable.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operations.records.get('network-off-prepare')?.operation).toMatchObject({ status: 'failed' })
  canonical.networks[1].on = true

  const txFailure = await quoteFor('quote-tx-failure')
  submitTransaction.mockImplementationOnce(async () => ({
    ok: false as const,
    error: 'provider_error',
    message: 'Transaction rejected.'
  }))
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'tx-failure',
        quoteId: txFailure.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operations.records.get('tx-failure')?.operation).toMatchObject({ status: 'failed' })

  const signFailure = await quoteFor('quote-sign-failure')
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'sign-failure',
        quoteId: signFailure.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  signTypedData.mockImplementationOnce(async () => ({
    ok: false as const,
    error: 'provider_error',
    message: 'Signing rejected.'
  }))
  const submitCountBeforeSignFailure = submitOrder.mock.calls.length
  expect(
    service.submit(
      { type: 'trade.submit', operationId: 'sign-failure', quoteId: signFailure.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(submitOrder).toHaveBeenCalledTimes(submitCountBeforeSignFailure)
  expect(operations.records.get('sign-failure')?.operation).toMatchObject({ status: 'failed' })

  const flashFailure = await quoteFor('quote-flash-failure')
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'flash-failure',
        quoteId: flashFailure.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  submitOrder.mockImplementationOnce(async () => {
    throw new Error('Flash unavailable')
  })
  expect(
    service.submit(
      { type: 'trade.submit', operationId: 'flash-failure', quoteId: flashFailure.quoteId },
      principal,
      owner
    )
  ).toBe(true)
  await flush()
  expect(operations.records.get('flash-failure')?.operation).toMatchObject({ status: 'failed' })

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
  expect(operations.records.get('cancel-stale')?.operation).toMatchObject({ status: 'failed' })
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
  expect(
    service.prepare(
      {
        type: 'trade.prepare',
        operationId: 'pending-dispose-trade',
        quoteId: pending.quoteId,
        action: 'approve'
      },
      principal,
      owner
    )
  ).toBe(true)
  expect(
    service.cancel(
      { type: 'flash.order-cancel', operationId: 'pending-dispose-cancel', orderId: 'order-cancel' },
      principal,
      owner
    )
  ).toBe(true)
  await Promise.resolve()
  service.dispose()
  expect(operations.records.get('pending-dispose-trade')?.operation).toMatchObject({ status: 'failed' })
  expect(operations.records.get('pending-dispose-cancel')?.operation).toMatchObject({ status: 'failed' })
  resolveTransaction({ ok: true, transactionHash: `0x${'b'.repeat(64)}` })
  resolveCancel({ ok: true, signature: '0xcancel-after-dispose' })
  await flush()
  expect(service.prepare(prepare, principal, owner)).toBe(false)
})
