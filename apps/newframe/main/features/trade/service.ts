import { isAddress } from 'ethers'

import {
  FlashQuoteDisplaySchema,
  TypedDataV4Schema,
  type FlashOrderCancelCommand,
  type FlashQuoteDisplay,
  type FlashQuoteRequest as RendererFlashQuoteRequest,
  type FlashQuoteResult,
  type TradePrepareCommand,
  type TradeSubmitCommand,
  type TypedDataV4
} from '../../../contracts/operations.js'
import type { FlashQuote, FlashQuoteAction } from '../../../domain/flash/schemas.js'
import {
  buildFlashActionTransaction,
  buildFlashSubmitRequest,
  findFlashTypedData,
  flashObject,
  flashTypedDataChainId,
  parseFlashTypedData
} from '../../../domain/flash/execution.js'
import type {
  FlashCancelOrderRequest,
  FlashQuoteRequest,
  FlashSubmitOrderRequest
} from '../../flash/contracts.js'
import type { TrustedPrincipal } from '../../authority.js'
import type { OperationService } from '../operations/service.js'
import type { OperationEntityRef } from '../../../domain/state/operation.js'
import type { OperationOwner, OperationReference } from '../operations/types.js'

type TradeAccount = { id: string; address: string }
type TradeOrder = {
  account?: string
  accountAddress?: string
  address?: string
  cancellable?: boolean
  chainId?: number | string | null
  open?: boolean
  orderId?: string
  status?: string
}

export interface TradeCanonicalSnapshot {
  currentAccount: string
  accounts: Record<string, TradeAccount | undefined>
  networks: Record<number, { on?: boolean } | undefined>
  orders: Record<string, TradeOrder | undefined>
}

export interface TradeServicePorts {
  canonical: { snapshot(): TradeCanonicalSnapshot }
  clock: { now(): number }
  flash: {
    quote(request: FlashQuoteRequest): Promise<{ quote: FlashQuote; flash: unknown }>
    submitOrder(request: FlashSubmitOrderRequest): Promise<{ orderId: string }>
    cancelOrder(request: FlashCancelOrderRequest): Promise<unknown>
  }
  operations: OperationService
  signatures: {
    signMessage(
      command: { chainId: number; message: string },
      principal: TrustedPrincipal
    ): Promise<{ ok: true; signature: string } | { ok: false; error: string; message?: string }>
    signTypedData(
      command: { chainId: number; typedData: TypedDataV4 },
      principal: TrustedPrincipal
    ): Promise<{ ok: true; signature: string } | { ok: false; error: string; message?: string }>
  }
  transactions: {
    submit(
      command: {
        chainId: number
        idempotencyKey: string
        transaction: { to: string; data?: string; value?: string }
      },
      principal: TrustedPrincipal
    ): Promise<{ ok: true; transactionHash: string } | { ok: false; error: string; message?: string }>
  }
}

type TradeAction = TradePrepareCommand['action'] | 'submit'

type PrivateQuoteRecord = {
  account: TradeAccount
  chainId: number
  completedActions: Set<TradePrepareCommand['action']>
  expiresAt: number
  flash: unknown
  owner: OperationOwner
  quote: FlashQuote
  quoteId: string
  request: RendererFlashQuoteRequest
  touchedAt: number
}

type TradeExecution = {
  completedFingerprints: Set<string>
  entityRefs: OperationEntityRef[]
  inFlight?: { action: TradeAction; fingerprint: string }
  quoteId: string
  reference: OperationReference
}

type IdempotencyEntry = { fingerprint: string; reference: OperationReference; touchedAt: number }

class TradeFailure extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const quoteLimit = 256
const idempotencyLimit = 256
const defaultQuoteLifetimeMs = 60_000
const tradeOperationType = 'trade.execute'
const cancelOperationType = 'flash.order-cancel'

const ownerKey = (owner: OperationOwner) => JSON.stringify([owner.clientType, owner.windowInstanceId])
const referenceKey = (reference: OperationReference) =>
  JSON.stringify([reference.owner.clientType, reference.owner.windowInstanceId, reference.id])
const quoteKey = (owner: OperationOwner, accountId: string, chainId: number, quoteId: string) =>
  JSON.stringify([owner.clientType, owner.windowInstanceId, accountId, chainId, quoteId])
const sameOwner = (left: OperationOwner, right: OperationOwner) =>
  left.clientType === right.clientType && left.windowInstanceId === right.windowInstanceId

function quoteField(record: PrivateQuoteRecord, field: string) {
  return findFlashTypedData(record.quote, record.flash, field as Parameters<typeof findFlashTypedData>[2])
}

function parseTypedData(value: unknown) {
  const parsed = parseFlashTypedData(value)
  const result = TypedDataV4Schema.safeParse(parsed)
  if (!result.success) throw new TradeFailure('quote_invalid', 'Flash quote is missing typed data.')
  return result.data
}

function safeAction(action?: FlashQuoteAction | null) {
  if (!action) return action
  return {
    id: action.id,
    kind: action.kind,
    label: action.label,
    asset: action.asset,
    amount: action.amount,
    amountRaw: action.amountRaw
  }
}

function nextAction(record: PrivateQuoteRecord): TradeAction {
  if (record.quote.actions?.wrap && !record.completedActions.has('wrap')) return 'wrap'
  if (record.quote.actions?.approval && !record.completedActions.has('approve')) return 'approve'
  return 'submit'
}

function displayQuote(record: PrivateQuoteRecord): FlashQuoteDisplay {
  const { raw: _raw, actions: _actions, ...display } = record.quote
  return FlashQuoteDisplaySchema.parse({
    ...display,
    id: record.quoteId,
    actions: {
      ...(record.quote.actions?.wrap ? { wrap: safeAction(record.quote.actions.wrap) } : {}),
      ...(record.quote.actions?.approval ? { approval: safeAction(record.quote.actions.approval) } : {})
    },
    nextAction: nextAction(record) === 'submit' ? 'sign' : nextAction(record),
    requiresPermit: Boolean(quoteField(record, 'permitTypedData'))
  })
}

function quoteExpiry(quote: FlashQuote, now: number) {
  const parsed = Date.parse(String(quote.expiresAt || ''))
  return Number.isFinite(parsed) ? parsed : now + defaultQuoteLifetimeMs
}

function operationRefs(record: PrivateQuoteRecord, extra: OperationEntityRef[] = []) {
  return [
    { type: 'account' as const, id: record.account.id },
    { type: 'chain' as const, id: String(record.chainId) },
    ...extra
  ]
}

export function createTradeService(ports: TradeServicePorts) {
  const quotes = new Map<string, PrivateQuoteRecord>()
  const quoteGenerations = new Map<string, number>()
  const executions = new Map<string, TradeExecution>()
  const cancelByOwnerOrder = new Map<string, OperationReference>()
  const idempotency = new Map<string, IdempotencyEntry>()
  let disposed = false

  const prune = () => {
    const now = ports.clock.now()
    for (const [key, record] of quotes) {
      if (record.expiresAt <= now) quotes.delete(key)
    }
    const orderedQuotes = [...quotes.entries()].sort(
      ([leftKey, left], [rightKey, right]) =>
        left.touchedAt - right.touchedAt || leftKey.localeCompare(rightKey)
    )
    for (const [key] of orderedQuotes.slice(0, Math.max(0, orderedQuotes.length - quoteLimit))) {
      quotes.delete(key)
    }

    for (const [key, entry] of idempotency) {
      if (!ports.operations.lookup(entry.reference)) idempotency.delete(key)
    }
    const orderedEntries = [...idempotency.entries()].sort(
      ([leftKey, left], [rightKey, right]) =>
        left.touchedAt - right.touchedAt || leftKey.localeCompare(rightKey)
    )
    for (const [key] of orderedEntries.slice(0, Math.max(0, orderedEntries.length - idempotencyLimit))) {
      idempotency.delete(key)
    }
  }

  const removeOwnerQuotes = (owner: OperationOwner) => {
    for (const [key, record] of quotes) {
      if (sameOwner(record.owner, owner)) quotes.delete(key)
    }
  }

  const currentAccount = (expectedAccountId?: string) => {
    const snapshot = ports.canonical.snapshot()
    const account = snapshot.accounts[snapshot.currentAccount]
    if (!account || (expectedAccountId && account.id !== expectedAccountId)) {
      throw new TradeFailure('account_changed', 'Trading account changed. Review the quote and try again.')
    }
    return { account, snapshot }
  }

  const validatedQuote = (owner: OperationOwner, id: string, expected?: PrivateQuoteRecord) => {
    prune()
    const { account, snapshot } = currentAccount(expected?.account.id)
    const record = [...quotes.values()].find(
      (candidate) =>
        candidate.quoteId === id && candidate.account.id === account.id && sameOwner(candidate.owner, owner)
    )
    if (!record || (expected && record !== expected)) {
      throw new TradeFailure('quote_unavailable', 'Flash quote is no longer available.')
    }
    if (record.expiresAt <= ports.clock.now()) {
      quotes.delete(quoteKey(owner, record.account.id, record.chainId, record.quoteId))
      throw new TradeFailure(
        'quote_expired',
        'Flash quote expired. Review the refreshed quote and try again.'
      )
    }
    if (!snapshot.networks[record.chainId]?.on) {
      throw new TradeFailure('network_unavailable', 'Chain is unavailable.')
    }
    return record
  }

  const startExecution = (operationId: string, quoteId: string, owner: OperationOwner) => {
    const reference: OperationReference = { owner, id: operationId, type: tradeOperationType }
    const key = referenceKey(reference)
    let execution = executions.get(key)
    if (execution) return { execution, key }
    if (ports.operations.lookup(reference)) return null

    let record: PrivateQuoteRecord | undefined
    try {
      record = validatedQuote(owner, quoteId)
    } catch {
      // Invalid and expired quote attempts still receive a terminal operation result.
    }
    try {
      ports.operations.start({
        id: operationId,
        type: tradeOperationType,
        owner,
        phase: 'validating',
        ...(record ? { entityRefs: operationRefs(record) } : {})
      })
    } catch {
      return null
    }
    execution = { completedFingerprints: new Set(), entityRefs: [], quoteId, reference }
    executions.set(key, execution)
    return { execution, key }
  }

  const settleFailure = (
    execution: TradeExecution,
    key: string,
    action: TradeAction,
    fingerprint: string,
    error: unknown
  ) => {
    const failure =
      error instanceof TradeFailure
        ? { code: error.code, message: error.message }
        : { code: 'trade_failed', message: 'Trade failed.' }
    ports.operations.fail(execution.reference, failure, `${action}_failed`)
    idempotency.set(key, { fingerprint, reference: execution.reference, touchedAt: ports.clock.now() })
    executions.delete(key)
  }

  const executePrepare = async (
    command: TradePrepareCommand,
    principal: TrustedPrincipal,
    owner: OperationOwner,
    execution: TradeExecution,
    key: string,
    fingerprint: string
  ) => {
    try {
      const record = validatedQuote(owner, command.quoteId)
      if (nextAction(record) !== command.action) {
        throw new TradeFailure('action_mismatch', 'Trade preparation step is no longer required.')
      }
      const action = command.action === 'wrap' ? record.quote.actions?.wrap : record.quote.actions?.approval
      if (!action?.tx)
        throw new TradeFailure('quote_invalid', 'Flash action is missing a transaction request.')
      let request: ReturnType<typeof buildFlashActionTransaction>
      try {
        request = buildFlashActionTransaction(action, record.chainId)
      } catch {
        throw new TradeFailure('chain_mismatch', 'Flash action chain changed.')
      }

      ports.operations.advance(execution.reference, {
        phase: command.action === 'wrap' ? 'wrapping' : 'approving',
        entityRefs: operationRefs(record, execution.entityRefs)
      })
      validatedQuote(owner, command.quoteId, record)
      const result = await ports.transactions.submit(
        {
          chainId: request.chainId,
          idempotencyKey: `${command.operationId}:${command.action}`,
          transaction: request.transaction
        },
        principal
      )
      if (!result.ok) throw new TradeFailure('provider_error', result.message || 'Transaction failed.')
      validatedQuote(owner, command.quoteId, record)
      if (disposed) throw new TradeFailure('application_shutdown', 'Trade was cancelled during shutdown.')

      record.completedActions.add(command.action)
      if (
        !execution.entityRefs.some(
          (reference) => reference.type === 'transaction' && reference.id === result.transactionHash
        )
      ) {
        execution.entityRefs.push({ type: 'transaction', id: result.transactionHash })
      }
      const next = nextAction(record)
      ports.operations.advance(execution.reference, {
        phase: next === 'approve' ? 'awaiting_approval' : 'awaiting_submit',
        entityRefs: operationRefs(record, execution.entityRefs)
      })
      execution.completedFingerprints.add(fingerprint)
      execution.inFlight = undefined
    } catch (error) {
      settleFailure(execution, key, command.action, fingerprint, error)
    }
  }

  const executeSubmit = async (
    command: TradeSubmitCommand,
    principal: TrustedPrincipal,
    owner: OperationOwner,
    execution: TradeExecution,
    key: string,
    fingerprint: string
  ) => {
    try {
      const record = validatedQuote(owner, command.quoteId)
      if (nextAction(record) !== 'submit') {
        throw new TradeFailure('action_required', 'Complete the required trade preparation first.')
      }

      let permitSignature = ''
      const permitValue = quoteField(record, 'permitTypedData')
      if (permitValue) {
        const typedData = parseTypedData(permitValue)
        const chainId = flashTypedDataChainId(typedData, record.chainId)
        if (chainId !== record.chainId) throw new TradeFailure('chain_mismatch', 'Permit chain changed.')
        ports.operations.advance(execution.reference, {
          phase: 'signing_permit',
          entityRefs: operationRefs(record, execution.entityRefs)
        })
        validatedQuote(owner, command.quoteId, record)
        const result = await ports.signatures.signTypedData({ chainId, typedData }, principal)
        if (!result.ok) {
          throw new TradeFailure('provider_error', result.message || 'Permit signature was not returned.')
        }
        permitSignature = result.signature
        validatedQuote(owner, command.quoteId, record)
      }

      const orderValue = quoteField(record, 'orderTypedData')
      const orderTypedData = parseTypedData(orderValue)
      const orderChainId = flashTypedDataChainId(orderTypedData, record.chainId)
      if (orderChainId !== record.chainId) throw new TradeFailure('chain_mismatch', 'Order chain changed.')
      ports.operations.advance(execution.reference, {
        phase: 'signing_order',
        entityRefs: operationRefs(record, execution.entityRefs)
      })
      validatedQuote(owner, command.quoteId, record)
      const signatureResult = await ports.signatures.signTypedData(
        { chainId: orderChainId, typedData: orderTypedData },
        principal
      )
      if (!signatureResult.ok) {
        throw new TradeFailure(
          'provider_error',
          signatureResult.message || 'Order signature was not returned.'
        )
      }
      validatedQuote(owner, command.quoteId, record)
      if (disposed) throw new TradeFailure('application_shutdown', 'Trade was cancelled during shutdown.')

      ports.operations.advance(execution.reference, {
        phase: 'submitting',
        entityRefs: operationRefs(record, execution.entityRefs)
      })
      const beforeSubmit = validatedQuote(owner, command.quoteId, record)
      const submitResult = await ports.flash.submitOrder(
        buildFlashSubmitRequest({
          accountAddress: beforeSubmit.account.address,
          flashPayload: beforeSubmit.flash,
          idempotencyKey: command.operationId,
          orderSignature: signatureResult.signature,
          ...(permitSignature ? { permitSignature } : {}),
          quote: beforeSubmit.quote,
          quoteId: beforeSubmit.quoteId,
          quoteRequest: beforeSubmit.request
        })
      )
      if (!submitResult.orderId) {
        throw new TradeFailure('submit_failed', 'Flash order submit did not return an order id.')
      }

      ports.operations.advance(execution.reference, {
        phase: 'submitted',
        entityRefs: operationRefs(record, [
          ...execution.entityRefs,
          { type: 'order', id: submitResult.orderId }
        ])
      })
      ports.operations.complete(execution.reference, 'submitted')
      idempotency.set(key, { fingerprint, reference: execution.reference, touchedAt: ports.clock.now() })
      executions.delete(key)
      quotes.delete(quoteKey(owner, record.account.id, record.chainId, record.quoteId))
    } catch (error) {
      settleFailure(execution, key, 'submit', fingerprint, error)
    }
  }

  const acceptTradeAction = (
    command: TradePrepareCommand | TradeSubmitCommand,
    principal: TrustedPrincipal,
    owner: OperationOwner
  ) => {
    if (disposed) return false
    const started = startExecution(command.operationId, command.quoteId, owner)
    const reference: OperationReference = { owner, id: command.operationId, type: tradeOperationType }
    const key = referenceKey(reference)
    const action: TradeAction = command.type === 'trade.prepare' ? command.action : 'submit'
    const fingerprint = JSON.stringify([command.quoteId, action])
    if (!started) return idempotency.get(key)?.fingerprint === fingerprint
    const { execution } = started
    if (execution.quoteId !== command.quoteId) return false
    if (execution.completedFingerprints.has(fingerprint)) return true
    if (execution.inFlight) return execution.inFlight.fingerprint === fingerprint

    execution.inFlight = { action, fingerprint }
    queueMicrotask(() => {
      if (command.type === 'trade.prepare') {
        void executePrepare(command, principal, owner, execution, key, fingerprint)
      } else {
        void executeSubmit(command, principal, owner, execution, key, fingerprint)
      }
    })
    return true
  }

  const validatedCancel = (orderId: string, expectedAccountId?: string) => {
    const { account, snapshot } = currentAccount(expectedAccountId)
    const order = snapshot.orders[orderId]
    if (!order) throw new TradeFailure('order_not_found', 'Order was not found.')
    const orderAddress = order.accountAddress || order.account || order.address || ''
    if (!isAddress(orderAddress) || orderAddress.toLowerCase() !== account.address.toLowerCase()) {
      throw new TradeFailure('account_changed', 'Order account changed.')
    }
    const chainId = Number(order.chainId)
    if (!Number.isInteger(chainId) || chainId <= 0 || !snapshot.networks[chainId]?.on) {
      throw new TradeFailure('network_unavailable', 'Chain is unavailable.')
    }
    if (order.open === false || order.cancellable === false) {
      throw new TradeFailure('order_not_cancellable', 'Order is no longer cancellable.')
    }
    return { account, chainId, order }
  }

  const executeCancel = async (
    command: FlashOrderCancelCommand,
    principal: TrustedPrincipal,
    reference: OperationReference,
    key: string,
    ownerOrderKey: string,
    fingerprint: string
  ) => {
    try {
      const initial = validatedCancel(command.orderId)
      ports.operations.advance(reference, {
        phase: 'signing_cancel',
        entityRefs: [
          { type: 'account', id: initial.account.id },
          { type: 'chain', id: String(initial.chainId) },
          { type: 'order', id: command.orderId }
        ]
      })
      const signature = await ports.signatures.signMessage(
        {
          chainId: initial.chainId,
          message: `Definitive Flash v1 — Cancel Order\nOrder: ${command.orderId}`
        },
        principal
      )
      if (!signature.ok) {
        throw new TradeFailure('provider_error', signature.message || 'Cancel signature was not returned.')
      }
      validatedCancel(command.orderId, initial.account.id)
      if (disposed) throw new TradeFailure('application_shutdown', 'Cancellation stopped during shutdown.')
      ports.operations.advance(reference, {
        phase: 'cancelling',
        entityRefs: [
          { type: 'account', id: initial.account.id },
          { type: 'chain', id: String(initial.chainId) },
          { type: 'order', id: command.orderId }
        ]
      })
      await ports.flash.cancelOrder({ orderId: command.orderId, signature: signature.signature })
      ports.operations.complete(reference, 'cancelled')
    } catch (error) {
      const failure =
        error instanceof TradeFailure
          ? { code: error.code, message: error.message }
          : { code: 'cancel_failed', message: 'Cancel failed.' }
      ports.operations.fail(reference, failure, 'cancel_failed')
    } finally {
      idempotency.set(key, { fingerprint, reference, touchedAt: ports.clock.now() })
      cancelByOwnerOrder.delete(ownerOrderKey)
    }
  }

  return {
    async quote(request: RendererFlashQuoteRequest, owner: OperationOwner): Promise<FlashQuoteResult> {
      if (disposed) return { ok: false, error: 'quote_failed', message: 'Trade service is unavailable.' }
      prune()
      const ownerScope = ownerKey(owner)
      const activeExecution = () =>
        [...executions.values()].some(
          (execution) =>
            sameOwner(execution.reference.owner, owner) &&
            !ports.operations.lookup(execution.reference)?.finishedAt
        )
      if (activeExecution()) {
        return { ok: false, error: 'quote_failed', message: 'Trade confirmation is in progress.' }
      }
      const generation = (quoteGenerations.get(ownerScope) || 0) + 1
      quoteGenerations.set(ownerScope, generation)
      try {
        const { account, snapshot } = currentAccount()
        if (!snapshot.networks[request.chainId]?.on) {
          throw new TradeFailure('network_unavailable', 'Chain is unavailable.')
        }
        const result = await ports.flash.quote({
          ...request,
          accountAddress: account.address,
          contraChain: request.chainId,
          targetChain: request.chainId
        })
        const current = currentAccount(account.id)
        if (!current.snapshot.networks[request.chainId]?.on) {
          throw new TradeFailure('network_unavailable', 'Chain is unavailable.')
        }
        if (quoteGenerations.get(ownerScope) !== generation || disposed || activeExecution()) {
          throw new TradeFailure('quote_unavailable', 'Flash quote is no longer available.')
        }
        const quoteId = String(result.quote.id || flashObject(result.flash).quoteId || '').trim()
        if (!quoteId) throw new TradeFailure('quote_invalid', 'Flash quote did not return a quote id.')
        const now = ports.clock.now()
        const expiresAt = quoteExpiry(result.quote, now)
        if (expiresAt <= now) throw new TradeFailure('quote_expired', 'Flash quote already expired.')
        const record: PrivateQuoteRecord = {
          account,
          chainId: request.chainId,
          completedActions: new Set(
            result.quote.steps.flatMap((step) =>
              step.status === 'complete' && (step.kind === 'wrap' || step.kind === 'approve')
                ? [step.kind]
                : []
            )
          ),
          expiresAt,
          flash: result.flash,
          owner,
          quote: result.quote,
          quoteId,
          request,
          touchedAt: now
        }
        removeOwnerQuotes(owner)
        quotes.set(quoteKey(owner, account.id, request.chainId, quoteId), record)
        prune()
        return { ok: true, quoteId, quote: displayQuote(record) }
      } catch (error) {
        const message =
          error instanceof TradeFailure
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Flash quote failed.'
        return { ok: false, error: 'quote_failed', message: message.slice(0, 1_000) }
      }
    },

    prepare(command: TradePrepareCommand, principal: TrustedPrincipal, owner: OperationOwner) {
      return acceptTradeAction(command, principal, owner)
    },

    submit(command: TradeSubmitCommand, principal: TrustedPrincipal, owner: OperationOwner) {
      return acceptTradeAction(command, principal, owner)
    },

    cancel(command: FlashOrderCancelCommand, principal: TrustedPrincipal, owner: OperationOwner) {
      if (disposed) return false
      const reference: OperationReference = { owner, id: command.operationId, type: cancelOperationType }
      const key = referenceKey(reference)
      const fingerprint = command.orderId
      if (ports.operations.lookup(reference)) return idempotency.get(key)?.fingerprint === fingerprint
      const ownerOrderKey = JSON.stringify([owner.clientType, owner.windowInstanceId, command.orderId])
      if (cancelByOwnerOrder.has(ownerOrderKey)) return false
      try {
        ports.operations.start({
          id: command.operationId,
          type: cancelOperationType,
          owner,
          phase: 'validating',
          entityRefs: [{ type: 'order', id: command.orderId }]
        })
      } catch {
        return false
      }
      // Cache acceptance before starting asynchronous work so a renderer can safely replay an
      // identical command when its first acknowledgement is lost. Conflicting operation-ID reuse
      // still fails through the fingerprint check above.
      idempotency.set(key, { fingerprint, reference, touchedAt: ports.clock.now() })
      cancelByOwnerOrder.set(ownerOrderKey, reference)
      queueMicrotask(() => void executeCancel(command, principal, reference, key, ownerOrderKey, fingerprint))
      return true
    },

    release(owner: OperationOwner) {
      const scope = ownerKey(owner)
      quoteGenerations.set(scope, (quoteGenerations.get(scope) || 0) + 1)
      removeOwnerQuotes(owner)
      for (const [key, execution] of executions) {
        if (!sameOwner(execution.reference.owner, owner)) continue
        ports.operations.fail(
          execution.reference,
          { code: 'renderer_closed', message: 'Trade was cancelled when the window closed.' },
          'cancelled'
        )
        executions.delete(key)
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const execution of executions.values()) {
        ports.operations.fail(
          execution.reference,
          { code: 'application_shutdown', message: 'Trade was cancelled during shutdown.' },
          'cancelled'
        )
      }
      for (const reference of cancelByOwnerOrder.values()) {
        ports.operations.fail(
          reference,
          { code: 'application_shutdown', message: 'Cancellation stopped during shutdown.' },
          'cancel_failed'
        )
      }
      quotes.clear()
      quoteGenerations.clear()
      executions.clear()
      cancelByOwnerOrder.clear()
      idempotency.clear()
    }
  }
}

export type TradeService = ReturnType<typeof createTradeService>
