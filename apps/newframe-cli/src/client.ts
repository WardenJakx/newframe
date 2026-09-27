import { createHash } from 'node:crypto'

import { createFlashApi, flashBaseUrl, flashCancelMessage } from '@newframe/flash/api'
import type { FlashQuoteRequest } from '@newframe/flash/contracts'
import {
  buildFlashActionTransaction,
  buildFlashSubmitRequest,
  findFlashTypedData,
  flashObject,
  flashTypedDataChainId,
  parseFlashTypedData
} from '@newframe/flash/execution'
import { getFlashAssetPairChains } from '@newframe/flash/pair'
import type { FlashQuote } from '@newframe/flash/schemas'
import { isFlashTerminalStatus, normalizeFlashStatus } from '@newframe/flash/status'

import { readSubmitProgress, saveSubmitProgress, withSubmitLock } from './journal.js'
import { clearSession, loadSession, saveSession, stateDirectory, type StoredSession } from './storage.js'

const defaultRpcUrl = 'http://127.0.0.1:1248'
const addressPattern = /^0x[0-9a-f]{40}$/i

export interface QuoteEnvelope {
  request: FlashQuoteRequest
  quote: FlashQuote
  flash: unknown
}

export interface ClientOptions {
  rpcUrl?: string
  flashUrl?: string
  stateDir?: string
  fetch?: typeof fetch
  pollIntervalMs?: number
  receiptTimeoutMs?: number
}

function errorMessage(payload: unknown, fallback: string) {
  const record = flashObject(payload)
  if (typeof record.error === 'string') {
    return record.error
  }
  if (record.error && typeof record.error === 'object') {
    const message = flashObject(record.error).message
    if (typeof message === 'string') {
      return message
    }
  }
  return typeof payload === 'string' && payload ? payload : fallback
}

async function responsePayload(response: Response) {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function requireAddress(address: string) {
  if (!addressPattern.test(address)) {
    throw new Error('Invalid account address')
  }
  return address.toLowerCase()
}

function parseQuoteEnvelope(value: unknown): QuoteEnvelope {
  const record = flashObject(value)
  if (!record.request || !record.quote || !('flash' in record)) {
    throw new Error('Expected a quote file produced by `newframe flash quote`')
  }
  return record as unknown as QuoteEnvelope
}

function typedDataValue(quote: FlashQuote, flash: unknown, field: 'orderTypedData' | 'permitTypedData') {
  const value = findFlashTypedData(quote, flash, `${field}Raw`) ?? findFlashTypedData(quote, flash, field)
  return value === undefined || value === null ? null : parseFlashTypedData(value)
}

function assertTypedDataChain(typedData: unknown, expectedChainId: number) {
  if (!typedData || typeof typedData !== 'object') {
    throw new Error('Flash quote has invalid typed data')
  }
  if (flashTypedDataChainId(typedData, expectedChainId) !== expectedChainId) {
    throw new Error('Flash signature chain does not match the quoted spend chain')
  }
}

function statusOf(order: unknown) {
  const record = flashObject(order)
  const nested = flashObject(record.order)
  return normalizeFlashStatus(nested.status ?? record.status)
}

function isClosedOrder(order: unknown) {
  const record = flashObject(order)
  const nested = flashObject(record.order)
  return nested.open === false || record.open === false || isFlashTerminalStatus(statusOf(order))
}

function assertQuoteFresh(quote: FlashQuote) {
  if (!quote.expiresAt) {
    return
  }
  const expiry = Date.parse(quote.expiresAt)
  if (!Number.isFinite(expiry)) {
    throw new Error('Flash quote has an invalid expiration')
  }
  if (expiry <= Date.now()) {
    throw new Error('Flash quote expired; request a new quote')
  }
}

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(`${status}: ${message}`)
  }
}

export class NewframeClient {
  readonly rpcUrl: string
  readonly flashUrl: string
  readonly stateDir?: string
  private readonly fetcher: typeof fetch
  private readonly pollIntervalMs: number
  private readonly receiptTimeoutMs: number
  private readonly flash: ReturnType<typeof createFlashApi>

  constructor(options: ClientOptions = {}) {
    this.rpcUrl = (options.rpcUrl ?? process.env.NEWFRAME_RPC_URL ?? defaultRpcUrl).replace(/\/$/, '')
    this.flashUrl = (options.flashUrl ?? process.env.NEWFRAME_FLASH_URL ?? flashBaseUrl()).replace(/\/$/, '')
    this.stateDir = options.stateDir ?? process.env.NEWFRAME_CLI_STATE_DIR
    this.fetcher = options.fetch ?? fetch
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000
    this.receiptTimeoutMs = options.receiptTimeoutMs ?? 120_000
    this.flash = createFlashApi({ baseUrl: this.flashUrl, fetch: this.fetcher })
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetcher(url, init)
    const payload = await responsePayload(response)
    if (!response.ok) {
      throw new HttpStatusError(response.status, errorMessage(payload, response.statusText))
    }
    return payload
  }

  private async session() {
    return loadSession(this.stateDir)
  }

  async startSession(input: { name: string; description?: string; url?: string; durationSeconds: number }) {
    let existing: StoredSession | undefined
    try {
      existing = await this.session()
    } catch (error) {
      if (!(error instanceof Error) || !/^(No CLI session|CLI session expired)/.test(error.message)) {
        throw error
      }
    }
    if (existing) {
      let stale = false
      try {
        // The agent handler authenticates before it rejects this malformed RPC body.
        await this.request(`${this.rpcUrl}/agent/rpc`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${existing.sessionToken}`,
            'content-type': 'application/json',
            'x-newframe-agent-session': existing.sessionId
          },
          body: '{}'
        })
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 401) {
          stale = true
        } else if (!(error instanceof HttpStatusError) || error.status !== 400) {
          throw error
        }
      }
      if (!stale) {
        throw new Error(
          `Session ${existing.sessionId} is still active. Run \`newframe session revoke\` first.`
        )
      }
    }
    const { durationSeconds, ...descriptor } = input
    const payload = flashObject(
      await this.request(`${this.rpcUrl}/agent/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ descriptor, durationSeconds })
      })
    )
    const session: StoredSession = {
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : '',
      sessionToken: typeof payload.sessionToken === 'string' ? payload.sessionToken : '',
      account: typeof payload.account === 'string' ? payload.account : '',
      expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : Number.NaN
    }
    if (
      !session.sessionId ||
      !session.sessionToken ||
      !addressPattern.test(session.account) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) {
      throw new Error('Newframe returned invalid session credentials')
    }
    if (existing) {
      try {
        await this.revokeCredentials(existing)
      } catch (error) {
        if (!(error instanceof HttpStatusError) || error.status !== 401) {
          await this.revokeCredentials(session).catch(() => undefined)
          throw error
        }
      }
    }
    await saveSession(session, this.stateDir)
    return { sessionId: session.sessionId, account: session.account, expiresAt: session.expiresAt }
  }

  async showSession() {
    const session = await this.session()
    return { sessionId: session.sessionId, account: session.account, expiresAt: session.expiresAt }
  }

  async revokeSession() {
    const session = await this.session()
    try {
      await this.revokeCredentials(session)
    } catch (error) {
      if (!(error instanceof HttpStatusError) || error.status !== 401) {
        throw error
      }
      await clearSession(this.stateDir)
      return { revoked: false, stale: true, sessionId: session.sessionId }
    }
    await clearSession(this.stateDir)
    return { revoked: true, sessionId: session.sessionId }
  }

  private revokeCredentials(session: StoredSession) {
    return this.request(`${this.rpcUrl}/agent/session/${encodeURIComponent(session.sessionId)}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
        'x-newframe-agent-session': session.sessionId
      }
    })
  }

  async rpc(method: string, params: unknown[] = [], chainId?: number): Promise<unknown> {
    const session = await this.session()
    const payload = flashObject(
      await this.request(`${this.rpcUrl}/agent/rpc`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.sessionToken}`,
          'content-type': 'application/json',
          'x-newframe-agent-session': session.sessionId,
          ...(chainId ? { 'x-newframe-chain-id': `0x${chainId.toString(16)}` } : {})
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })
    )
    if (payload.error) {
      throw new Error(errorMessage(payload, 'Newframe RPC failed'))
    }
    if (!('result' in payload)) {
      throw new Error('Newframe RPC did not return a result')
    }
    return payload.result
  }

  private async publicRpc(method: string, params: unknown[], chainId: number) {
    const payload = flashObject(
      await this.request(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-newframe-chain-id': `0x${chainId.toString(16)}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })
    )
    if (payload.error) {
      throw new Error(errorMessage(payload, 'Newframe RPC failed'))
    }
    return payload.result
  }

  async quote(request: FlashQuoteRequest): Promise<QuoteEnvelope> {
    const session = await this.session()
    if (
      request.accountAddress &&
      requireAddress(request.accountAddress) !== requireAddress(session.account)
    ) {
      throw new Error('Quote account does not match the approved session account')
    }
    const boundRequest = { ...request, accountAddress: session.account }
    const { quote, flash } = await this.flash.quote(boundRequest)
    return { request: boundRequest, quote, flash }
  }

  private async waitForReceipt(hash: string, chainId: number) {
    const deadline = Date.now() + this.receiptTimeoutMs
    while (Date.now() < deadline) {
      const value = flashObject(await this.publicRpc('eth_getTransactionReceipt', [hash], chainId))
      if (value.status === '0x0') {
        throw new Error(`Flash preparation transaction reverted: ${hash}`)
      }
      if (value.transactionHash || value.status === '0x1') {
        return value
      }
      await Bun.sleep(this.pollIntervalMs)
    }
    throw new Error(`Timed out waiting for Flash preparation transaction ${hash}`)
  }

  private async signTypedData(account: string, typedData: unknown, chainId: number) {
    assertTypedDataChain(typedData, chainId)
    const signature = await this.rpc('eth_signTypedData_v4', [account, JSON.stringify(typedData)], chainId)
    if (typeof signature !== 'string' || !/^0x[0-9a-f]+$/i.test(signature)) {
      throw new Error('Newframe did not return a Flash signature')
    }
    return signature
  }

  async submit(input: unknown) {
    const { request, quote, flash } = parseQuoteEnvelope(input)
    const session = await this.session()
    const account = requireAddress(session.account)
    if (!request.accountAddress || requireAddress(request.accountAddress) !== account) {
      throw new Error('Quote account does not match the approved session account')
    }
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify({ account, request, quoteId: quote.id, flash }))
      .digest('hex')
    const directory = this.stateDir ?? stateDirectory()
    return withSubmitLock(
      idempotencyKey,
      async () => {
        const progress = (await readSubmitProgress(idempotencyKey, directory)) ?? {
          account,
          actions: {}
        }
        if (progress.account !== account) {
          throw new Error('Flash submission journal belongs to another account')
        }
        if (progress.orderId) {
          return { orderId: progress.orderId, raw: progress.raw }
        }
        const save = () => saveSubmitProgress(idempotencyKey, progress, directory)
        assertQuoteFresh(quote)
        const spentChainId = getFlashAssetPairChains(quote).spentChainId
        const actions = [
          ['wrap', quote.actions?.wrap],
          ['approval', quote.actions?.approval]
        ] as const
        for (const [kind, action] of actions) {
          if (!action) {
            continue
          }
          const built = buildFlashActionTransaction(action, spentChainId)
          if (action.tx.from && requireAddress(action.tx.from) !== account) {
            throw new Error('Flash preparation transaction is from a different account')
          }
          let step = progress.actions[kind]
          if (step?.phase === 'sending') {
            throw new Error(`Flash ${kind} broadcast outcome is unknown; inspect the chain before retrying`)
          }
          if (!step) {
            progress.actions[kind] = { phase: 'sending' }
            await save()
            const hash = await this.rpc(
              'eth_sendTransaction',
              [{ ...built.transaction, from: account, chainId: `0x${spentChainId.toString(16)}` }],
              spentChainId
            )
            if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) {
              throw new Error('Newframe did not return a preparation transaction hash')
            }
            step = { phase: 'sent', hash, confirmed: false }
            progress.actions[kind] = step
            await save()
          }
          if (!step.confirmed) {
            await this.waitForReceipt(step.hash, spentChainId)
            step.confirmed = true
            await save()
          }
        }
        assertQuoteFresh(quote)
        const permitTypedData = typedDataValue(quote, flash, 'permitTypedData')
        const permitSignature = permitTypedData
          ? await this.signTypedData(account, permitTypedData, spentChainId)
          : undefined
        const orderTypedData = typedDataValue(quote, flash, 'orderTypedData')
        if (!orderTypedData) {
          throw new Error('Flash quote has no order typed data')
        }
        const orderSignature = await this.signTypedData(account, orderTypedData, spentChainId)
        const submitRequest = buildFlashSubmitRequest({
          accountAddress: account,
          flashPayload: flash,
          idempotencyKey,
          orderSignature,
          ...(permitSignature ? { permitSignature } : {}),
          quote,
          quoteId: quote.id,
          quoteRequest: request
        })
        assertQuoteFresh(quote)
        const raw = await this.flash.submitOrder(submitRequest)
        const orderId = raw.orderId
        progress.orderId = orderId
        progress.raw = raw
        await save()
        return { orderId, raw }
      },
      directory
    )
  }

  async orders(options: { status?: string; pageSize?: number } = {}) {
    const session = await this.session()
    return this.flash.listOrders(session.account, options)
  }

  async order(orderId: string) {
    const session = await this.session()
    return this.flash.getOrder(session.account, orderId)
  }

  async watch(orderId: string, options: { timeoutMs?: number } = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000)
    let latest: unknown
    while (Date.now() < deadline) {
      latest = await this.order(orderId)
      if (isClosedOrder(latest)) {
        return latest
      }
      await Bun.sleep(this.pollIntervalMs)
    }
    throw new Error(`Timed out waiting for Flash order ${orderId}; last status: ${statusOf(latest)}`)
  }

  async cancel(orderId: string) {
    const order = await this.order(orderId)
    const session = await this.session()
    const record = order.order
    const owner =
      record.accountAddress ??
      record.funderAddress ??
      record.account ??
      order.accountAddress ??
      order.funderAddress ??
      order.account
    if (typeof owner !== 'string' || requireAddress(owner) !== requireAddress(session.account)) {
      throw new Error('Flash order does not belong to the approved session account')
    }
    const cancelMessage = flashCancelMessage(orderId)
    const signature = await this.rpc('personal_sign', [cancelMessage, session.account])
    if (typeof signature !== 'string' || !signature) {
      throw new Error('Newframe did not return a cancel signature')
    }
    return this.flash.cancelOrder(orderId, signature, cancelMessage)
  }
}
