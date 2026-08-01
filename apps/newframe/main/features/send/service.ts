import { isAddress } from 'ethers'

import type { SendSubmitCommand } from '../../../contracts/operations.js'
import { buildSendTransaction, type SendTransaction } from '../../../domain/transaction/send.js'
import { NATIVE_CURRENCY } from '../../../domain/token/constants.js'
import { toTokenId } from '../../../domain/token/index.js'
import type { TrustedPrincipal } from '../../authority.js'
import type { OperationService } from '../operations/service.js'
import type { OperationOwner, OperationReference } from '../operations/types.js'

type SendAccount = { id: string; address: string }
type SendBalance = { address: string; balance: string; chainId: number }

export interface SendCanonicalSnapshot {
  currentAccount: string
  accounts: Record<string, SendAccount | undefined>
  balances: Record<string, SendBalance[] | undefined>
  networks: Record<number, { on?: boolean } | undefined>
  tokens: Record<string, { address: string; chainId: number } | undefined>
}

export interface SendIdempotencyEntry {
  fingerprint: string
  reference: OperationReference
  touchedAt: number
}

export interface SendServicePorts {
  canonical: { snapshot(): SendCanonicalSnapshot }
  clock: { now(): number }
  idempotency: {
    clear(): void
    delete(key: string): void
    entries(): IterableIterator<[string, SendIdempotencyEntry]>
    get(key: string): SendIdempotencyEntry | undefined
    set(key: string, value: SendIdempotencyEntry): void
  }
  names: { resolve(name: string): Promise<string | undefined> }
  operations: OperationService
  transactions: {
    submit(
      command: {
        chainId: number
        idempotencyKey: string
        transaction: SendTransaction
      },
      principal: TrustedPrincipal
    ): Promise<{ ok: true; transactionHash: string } | { ok: false; error: string; message?: string }>
  }
}

type ValidatedSend = {
  account: SendAccount
  amount: bigint
  recipientAddress: string
}

class SendFailure extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const idempotencyLimit = 256
const operationType = 'send.submit'

const normalizedRecipient = (recipient: string) => recipient.trim().toLowerCase()
const normalizedAsset = (command: SendSubmitCommand) => ({
  address: command.asset.address.toLowerCase(),
  chainId: command.asset.chainId
})

function idempotencyKey(reference: OperationReference) {
  return JSON.stringify([reference.owner.clientType, reference.owner.windowInstanceId, reference.id])
}

function fingerprint(command: SendSubmitCommand) {
  const asset = normalizedAsset(command)
  return JSON.stringify([
    asset.chainId,
    asset.address,
    command.amount,
    normalizedRecipient(command.recipient)
  ])
}

function canonicalBalance(snapshot: SendCanonicalSnapshot, account: SendAccount, command: SendSubmitCommand) {
  const asset = normalizedAsset(command)
  const balances =
    snapshot.balances[account.address.toLowerCase()] || snapshot.balances[account.address] || []
  return balances.find(
    (balance) => Number(balance.chainId) === asset.chainId && balance.address.toLowerCase() === asset.address
  )
}

function validateCanonicalIntent(
  snapshot: SendCanonicalSnapshot,
  command: SendSubmitCommand,
  recipientAddress: string,
  expectedAccountId?: string
): ValidatedSend {
  const account = snapshot.accounts[snapshot.currentAccount]
  if (!account || (expectedAccountId && account.id !== expectedAccountId)) {
    throw new SendFailure('account_changed', 'Sending account changed. Review the transfer and try again.')
  }

  let amount: bigint
  try {
    amount = BigInt(command.amount)
  } catch {
    throw new SendFailure('invalid_amount', 'Enter an amount to send.')
  }
  if (amount <= 0n) throw new SendFailure('invalid_amount', 'Enter an amount to send.')

  const asset = normalizedAsset(command)
  if (!snapshot.networks[asset.chainId]?.on) {
    throw new SendFailure('network_unavailable', 'Chain is unavailable.')
  }
  const balance = canonicalBalance(snapshot, account, command)
  if (!balance) throw new SendFailure('asset_unavailable', 'Asset is unavailable.')
  if (asset.address !== NATIVE_CURRENCY && !snapshot.tokens[toTokenId(asset)]) {
    throw new SendFailure('asset_unavailable', 'Asset is unavailable.')
  }

  let available: bigint
  try {
    available = BigInt(balance.balance)
  } catch {
    throw new SendFailure('balance_unavailable', 'Available balance could not be verified.')
  }
  if (amount > available) {
    throw new SendFailure('insufficient_balance', 'Amount exceeds available balance.')
  }
  if (!isAddress(recipientAddress)) {
    throw new SendFailure('invalid_recipient', 'Enter a valid recipient.')
  }

  return { account, amount, recipientAddress: recipientAddress.toLowerCase() }
}

export function createSendService(ports: SendServicePorts) {
  const pending = new Map<string, OperationReference>()
  let disposed = false

  const pruneIdempotency = () => {
    for (const [key, entry] of ports.idempotency.entries()) {
      if (!ports.operations.lookup(entry.reference)) ports.idempotency.delete(key)
    }
    const entries = [...ports.idempotency.entries()].sort(
      ([leftKey, left], [rightKey, right]) =>
        left.touchedAt - right.touchedAt || leftKey.localeCompare(rightKey)
    )
    for (const [key] of entries.slice(0, Math.max(0, entries.length - idempotencyLimit))) {
      ports.idempotency.delete(key)
    }
  }

  const execute = async (
    command: SendSubmitCommand,
    principal: TrustedPrincipal,
    reference: OperationReference,
    key: string
  ) => {
    try {
      const recipientInput = command.recipient.trim()
      const initial = validateCanonicalIntent(
        ports.canonical.snapshot(),
        command,
        isAddress(recipientInput) ? recipientInput : '0x0000000000000000000000000000000000000000'
      )

      let recipientAddress = recipientInput
      if (!isAddress(recipientInput)) {
        if (/\s/.test(recipientInput)) {
          throw new SendFailure('invalid_recipient', 'Enter a valid recipient.')
        }
        ports.operations.advance(reference, { phase: 'resolving_recipient' })
        recipientAddress = (await ports.names.resolve(recipientInput)) || ''
        if (!isAddress(recipientAddress)) {
          throw new SendFailure('recipient_not_found', 'Could not resolve recipient.')
        }
      }

      const validated = validateCanonicalIntent(
        ports.canonical.snapshot(),
        command,
        recipientAddress,
        initial.account.id
      )
      if (disposed)
        throw new SendFailure('application_shutdown', 'Transaction was cancelled during shutdown.')

      ports.operations.advance(reference, { phase: 'submitting' })
      const result = await ports.transactions.submit(
        {
          chainId: command.asset.chainId,
          idempotencyKey: command.operationId,
          transaction: buildSendTransaction({
            amount: validated.amount,
            asset: command.asset,
            recipientAddress: validated.recipientAddress
          })
        },
        principal
      )
      if (!result.ok) {
        throw new SendFailure('provider_error', result.message || 'Transaction failed.')
      }

      ports.operations.advance(reference, {
        phase: 'submitted',
        entityRefs: [
          { type: 'account', id: validated.account.id },
          { type: 'chain', id: String(command.asset.chainId) },
          { type: 'token', id: toTokenId(command.asset) },
          { type: 'transaction', id: result.transactionHash }
        ]
      })
      ports.operations.complete(reference, 'submitted')
    } catch (error) {
      const failure =
        error instanceof SendFailure
          ? { code: error.code, message: error.message }
          : { code: 'send_failed', message: 'Transaction failed.' }
      ports.operations.fail(reference, failure, 'failed')
    } finally {
      pending.delete(key)
    }
  }

  return {
    submit(command: SendSubmitCommand, principal: TrustedPrincipal, owner: OperationOwner) {
      if (disposed) return false
      const reference: OperationReference = { owner, id: command.operationId, type: operationType }
      const key = idempotencyKey(reference)
      const requestFingerprint = fingerprint(command)
      const existing = ports.operations.lookup(reference)
      if (existing) return ports.idempotency.get(key)?.fingerprint === requestFingerprint

      pruneIdempotency()
      try {
        ports.operations.start({
          id: reference.id,
          type: reference.type,
          owner,
          phase: 'validating',
          entityRefs: [
            { type: 'chain', id: String(command.asset.chainId) },
            { type: 'token', id: toTokenId(command.asset) }
          ]
        })
      } catch {
        return false
      }
      ports.idempotency.set(key, {
        fingerprint: requestFingerprint,
        reference,
        touchedAt: ports.clock.now()
      })
      pending.set(key, reference)
      queueMicrotask(() => void execute(command, principal, reference, key))
      return true
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const reference of pending.values()) {
        ports.operations.fail(
          reference,
          { code: 'application_shutdown', message: 'Transaction was cancelled during shutdown.' },
          'failed'
        )
      }
      pending.clear()
      ports.idempotency.clear()
    }
  }
}

export type SendService = ReturnType<typeof createSendService>
