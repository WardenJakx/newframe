import { addHexPrefix } from '@ethereumjs/util'
import type { ChainId as Chain } from '@newframe/schema/chains'
import type { AccountRequest, TransactionRequest, TransactionReceipt } from '@newframe/schema/request-records'
import { RequestStatus, RequestMode } from '@newframe/schema/request-records'
import type { RPC, RPCRequestCallback, RPCRequestPayload, RPCResponsePayload } from '@newframe/schema/rpc'
import type { Token } from '@newframe/schema/tokens'
import type { TransactionEffect } from '@newframe/schema/transactions'
import type { ActivityRecord } from '@newframe/schema/wallet-state'
import log from 'electron-log'

import {
  TRANSACTION_CONFIRMATION_TARGET,
  getTransactionIntent,
  getTransactionPositionTokens,
  getTransactionEffects,
  getPaidTransactionFee
} from '../../../features/transactions/domain/index.ts'
import type { StatusNotification } from '../../../platform/state-store/state/index.ts'
import { weiIntToEthInt, hexToInt } from '../../../shared/domain/hex.ts'
import { cloneSerializable } from '../../../shared/domain/serialization.ts'

function shortHash(hash?: string) {
  if (!hash) {
    return ''
  }
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`
}

function isBalanceChange(
  effect: TransactionEffect
): effect is TransactionEffect & { kind: 'native' | 'erc20'; direction: 'in' | 'out' } {
  return (
    (effect.kind === 'native' || effect.kind === 'erc20') &&
    (effect.direction === 'in' || effect.direction === 'out')
  )
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function transactionReceiptValue(value: unknown): TransactionReceipt | undefined {
  const receipt = unknownRecord(value)
  if (typeof receipt.gasUsed !== 'string' || typeof receipt.blockNumber !== 'string') {
    return undefined
  }
  if (receipt.status !== undefined && typeof receipt.status !== 'string') {
    return undefined
  }
  if (receipt.effectiveGasPrice !== undefined && typeof receipt.effectiveGasPrice !== 'string') {
    return undefined
  }
  return receipt as unknown as TransactionReceipt
}

function transactionActivityId(hash: string) {
  return hash
}

function transactionAccountActivityId(hash: string, address: string) {
  return `${hash}:${address.toLowerCase()}`
}

function transactionNotificationId(hash: string) {
  return `transaction:${hash}`
}

function normalizeQuantity(value?: string | number | null) {
  if (value === undefined || value === null || value === '') {
    return ''
  }

  try {
    return BigInt(value).toString()
  } catch {
    return String(value).toLowerCase()
  }
}

function normalizeChainId(value?: string | number | null) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const chainId = typeof value === 'string' ? parseInt(value, value.startsWith('0x') ? 16 : 10) : value
  return Number.isFinite(chainId) ? chainId : undefined
}

type HistoryRpcMethod = 'eth_getTransactionReceipt' | 'eth_blockNumber' | 'eth_subscribe' | 'eth_unsubscribe'
type HistoryRpcPayload = Omit<RPCRequestPayload, 'method'> & { method: HistoryRpcMethod }

type ActivityUpdate = Partial<ActivityRecord> & Record<string, unknown>
interface HistoryAccount {
  readonly address: string
}

export interface HistoryRequestHandle extends HistoryAccount {
  exists(): boolean
  get(requestId: string): TransactionRequest | undefined
  list(): Readonly<Record<string, AccountRequest | undefined>>
  patch(requestId: string, update: (draft: TransactionRequest) => void): TransactionRequest | undefined
  remove(requestId: string): void
}

export interface TransactionSubmission {
  account: HistoryAccount
  requestId: string
  request: TransactionRequest
  hash: string
}

export interface TransactionHistoryPorts {
  history: {
    get(id: string): ActivityRecord | undefined
    list(): readonly ActivityRecord[]
    submitted(record: ActivityRecord): void
    update(id: string, update: ActivityUpdate): void
    finalize(id: string, status: 'succeeded' | 'reverted', update: ActivityUpdate): void
    prune(id: string): void
  }
  wallet: {
    isActiveProfileAccount(accountId: string): boolean
    profileAddresses(profileId: string): readonly string[]
    displaySymbol(chainId: number): string | undefined
    nativeSymbol(chainId: number): string | undefined
    ethereumUsdRate(): number | undefined
  }
  rpc: {
    send(payload: HistoryRpcPayload, respond: RPCRequestCallback): unknown
    on(event: string | symbol, listener: (...args: never[]) => void): unknown
    off(event: string | symbol, listener: (...args: never[]) => void): unknown
  }
  positions: {
    track(address: string, tokens: Token[]): Token[]
    refresh(address: string, chainId: number, tokens: Token[]): boolean
  }
  notifications: {
    get(id: string): StatusNotification | undefined
    pending(notification: StatusNotification): void
    resolve(id: string, status: 'completed' | 'failed', update: Partial<StatusNotification>): void
    native(title: string, body: string, open: () => void): void
    openExplorer(chain: Chain, hash: string): void
  }
  clock: { now(): number }
  timers: {
    schedule(callback: () => void, delayMs: number): unknown
    every(callback: () => void, delayMs: number): () => void
  }
  internalOriginId: string
}

const CONFIRMED_REQUEST_CLOSE_MS = 3000

export class TransactionHistoryService {
  private activityMonitors: Record<
    string,
    { accountId: string; stop: () => void; token: symbol } | undefined
  > = {}
  private requestActivityMonitors: Record<
    string,
    { accountId: string; stop: () => void; token: symbol } | undefined
  > = {}
  private pendingPositionRefreshes = new Map<string, TransactionRequest>()
  private transactionPositionTokensByHash = new Map<string, Token[]>()

  constructor(private readonly dependencies: TransactionHistoryPorts) {}

  start() {
    this.resumeActivityTracking()
  }

  reconcileProfile() {
    Object.entries(this.activityMonitors).forEach(([id, monitor]) => {
      if (monitor && !this.dependencies.wallet.isActiveProfileAccount(monitor.accountId)) {
        this.stopActivityMonitor(id)
      }
    })
    Object.entries(this.requestActivityMonitors).forEach(([id, monitor]) => {
      if (monitor && !this.dependencies.wallet.isActiveProfileAccount(monitor.accountId)) {
        this.stopRequestActivityMonitor(id)
      }
    })
    this.resumeActivityTracking()
  }

  recordSubmission({ account, requestId, request, hash }: TransactionSubmission) {
    this.recordSubmittedTransaction(account, requestId, request, hash)
  }

  trackDetached(input: TransactionSubmission) {
    this.recordSubmission(input)
    const activity = this.dependencies.history.get(transactionActivityId(input.hash))
    if (activity) {
      this.resumeActivityMonitor(activity)
    }
  }

  scannerReady() {
    this.pendingPositionRefreshes.forEach((request) => this.refreshTransactionPositions(request))
  }

  close() {
    this.pendingPositionRefreshes.clear()
    this.transactionPositionTokensByHash.clear()
    Object.keys(this.activityMonitors).forEach((id) => this.stopActivityMonitor(id))
    Object.keys(this.requestActivityMonitors).forEach((id) => this.stopRequestActivityMonitor(id))
  }

  private sendRequest(
    {
      method,
      params,
      chainId,
      _origin = this.dependencies.internalOriginId
    }: { method: HistoryRpcMethod; params: unknown[]; chainId: string; _origin?: string },
    callback: RPCRequestCallback
  ) {
    this.dependencies.rpc.send({ id: 1, jsonrpc: '2.0', method, params, chainId, _origin }, callback)
  }

  private getTransactionChain(req: TransactionRequest): Chain | undefined {
    const chainId = req.data.chainId ? parseInt(req.data.chainId, 16) : 0
    if (!chainId) {
      return undefined
    }

    return {
      type: 'ethereum',
      id: chainId
    }
  }

  private getTransactionActivityDisplay(req: TransactionRequest, chain?: Chain) {
    const value = req.data.value
    const chainSymbol = chain ? this.dependencies.wallet.displaySymbol(chain.id) : ''
    const intent = getTransactionIntent(req, chainSymbol)

    if (intent.title !== 'Review transaction') {
      return intent
    }

    if (value && value !== '0x0') {
      return {
        title: `Send ${chainSymbol}`,
        subtitle: 'Native transfer'
      }
    }

    if (req.decodedData?.method) {
      return {
        title: req.decodedData.method,
        subtitle: req.decodedData.contractName || 'Contract interaction'
      }
    }

    return {
      title: req.classification === 'CONTRACT_DEPLOY' ? 'Deploy contract' : 'Transaction',
      subtitle: req.classification === 'CONTRACT_DEPLOY' ? 'Contract creation' : 'Submitted transaction'
    }
  }

  private getTransactionNativeSymbol(req: TransactionRequest) {
    const chain = this.getTransactionChain(req)
    return (chain ? this.dependencies.wallet.nativeSymbol(chain.id) : undefined) ?? 'ETH'
  }

  private getAccountRelativeActivityDisplay(effects: TransactionEffect[]) {
    const incoming = effects.filter((effect) => effect.direction === 'in')
    const outgoing = effects.filter((effect) => effect.direction === 'out')

    if (incoming.length === effects.length) {
      return effects.length === 1
        ? { title: `Receive ${effects[0].symbol}`, subtitle: 'Incoming transfer' }
        : { title: 'Receive assets', subtitle: 'Incoming assets' }
    }

    if (outgoing.length === effects.length) {
      return effects.length === 1
        ? { title: `Send ${effects[0].symbol}`, subtitle: 'Outgoing transfer' }
        : { title: 'Send assets', subtitle: 'Outgoing assets' }
    }

    return { title: 'Asset changes', subtitle: 'Incoming and outgoing assets' }
  }

  private materializeAccountRelativeActivity(req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash || req.simulation?.status !== 'success') {
      return
    }

    const { effectsByAccount, effectsProfileId } = req.simulation
    if (!effectsByAccount || !effectsProfileId) {
      return
    }

    const sourceId = transactionActivityId(hash)
    const source = this.dependencies.history.get(sourceId)
    if (source?.status !== 'succeeded') {
      return
    }

    const sourceAddress = String(
      ((source.account ?? source.address ?? req.account) || req.data.from) ?? ''
    ).toLowerCase()
    const sourceEffects = (effectsByAccount[sourceAddress] ?? req.simulation.effects).filter(isBalanceChange)
    this.dependencies.history.update(sourceId, {
      balanceChanges: cloneSerializable(sourceEffects),
      updatedAt: source.updatedAt
    })

    const profileAccounts = new Map(
      this.dependencies.wallet
        .profileAddresses(effectsProfileId)
        .map((address) => [address.toLowerCase(), address])
    )

    Object.entries(effectsByAccount).forEach(([mapAddress, effects]) => {
      const address = mapAddress.toLowerCase()
      const balanceChanges = effects.filter(isBalanceChange)
      if (address === sourceAddress || !balanceChanges.length || !profileAccounts.has(address)) {
        return
      }

      const id = transactionAccountActivityId(hash, address)
      const { positionsRefreshedAt: _positionsRefreshedAt, accounts: _accounts, ...shared } = source
      this.dependencies.history.finalize(id, 'succeeded', {
        ...shared,
        id,
        hash,
        account: address,
        address,
        balanceChanges: cloneSerializable(balanceChanges),
        gasSpent: null,
        display: this.getAccountRelativeActivityDisplay(balanceChanges)
      })
    })
  }

  private transactionActivityRecord(
    account: HistoryAccount,
    handlerId: string,
    req: TransactionRequest,
    hash: string
  ): ActivityRecord {
    const chain = this.getTransactionChain(req)
    const display = this.getTransactionActivityDisplay(req, chain)

    return {
      id: transactionActivityId(hash),
      hash,
      handlerId,
      account: account.address,
      address: account.address,
      ...(req.safeTxHash && req.safeExecution?.submitted?.executorId
        ? {
            accounts: [
              ...new Set(
                [account.address, req.safeExecution.submitted.executorId].map((id) => id.toLowerCase())
              )
            ]
          }
        : {}),
      chainId: chain?.id,
      chainType: chain?.type ?? 'ethereum',
      nonce: req.safeTxHash ? undefined : req.data.nonce,
      origin: req.origin,
      submittedAt: this.dependencies.clock.now(),
      updatedAt: this.dependencies.clock.now(),
      status: 'submitted' as const,
      confirmations: req.tx?.confirmations ?? 0,
      receipt: cloneSerializable(req.tx?.receipt),
      data: cloneSerializable(req.data),
      payload: cloneSerializable(req.payload),
      decodedData: cloneSerializable(req.decodedData),
      tokenData: cloneSerializable(req.tokenData),
      chainData: cloneSerializable(req.chainData),
      simulation: cloneSerializable(req.simulation),
      recognizedActions: cloneSerializable(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      ...(req.safeTxHash
        ? {
            metadata: {
              safe: {
                safeTxHash: req.safeTxHash,
                inner: cloneSerializable(req.data),
                outer: cloneSerializable(req.safeExecution)
              }
            }
          }
        : {}),
      display
    }
  }

  private upsertTransactionNotification(account: HistoryAccount, req: TransactionRequest, hash: string) {
    const chain = this.getTransactionChain(req)
    const display = this.getTransactionActivityDisplay(req, chain)
    const now = this.dependencies.clock.now()

    this.dependencies.notifications.pending({
      id: transactionNotificationId(hash),
      state: 'pending',
      title: display.title,
      detail: shortHash(hash),
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 60 * 1000,
      leadingIcon: chain ? { chainType: chain.type, chainId: chain.id } : undefined,
      target: {
        type: 'transactionActivity',
        activityId: transactionActivityId(hash),
        hash,
        account: account.address,
        chainId: chain?.id,
        chainType: chain?.type ?? 'ethereum'
      }
    })
  }

  private recordSubmittedTransaction(
    account: HistoryAccount,
    handlerId: string,
    req: TransactionRequest,
    hash: string
  ) {
    const positionTokens = this.saveTransactionPositionTokens(account.address, req)
    this.transactionPositionTokensByHash.set(hash, positionTokens)
    this.dependencies.history.submitted(this.transactionActivityRecord(account, handlerId, req, hash))
    this.upsertTransactionNotification(account, req, hash)
  }

  private transactionPositionTokens(req: TransactionRequest) {
    return getTransactionPositionTokens(req) as Token[]
  }

  private saveTransactionPositionTokens(address: string, req: TransactionRequest) {
    return this.dependencies.positions.track(address, this.transactionPositionTokens(req))
  }

  private refreshTransactionPositions(req: TransactionRequest) {
    const hash = req.tx?.hash
    const chainId = this.transactionChainId(req)
    const address = ((req.account || req.data.from) ?? '').toLowerCase()
    if (!hash || !chainId || !address || !req.tx?.receipt) {
      return
    }

    const activity = this.dependencies.history.get(transactionActivityId(hash))
    if (activity?.positionsRefreshedAt) {
      return
    }

    const requestTokens = this.transactionPositionTokens(req)
    const tokens = requestTokens.length
      ? requestTokens
      : (this.transactionPositionTokensByHash.get(hash) ??
        (activity ? this.transactionPositionTokens(activity as unknown as TransactionRequest) : []))
    if (!this.dependencies.positions.refresh(address, chainId, tokens)) {
      this.pendingPositionRefreshes.set(hash, req)
      return
    }

    this.dependencies.history.update(transactionActivityId(hash), {
      positionsRefreshedAt: this.dependencies.clock.now()
    })
    this.pendingPositionRefreshes.delete(hash)
    this.transactionPositionTokensByHash.delete(hash)
  }

  enrich(account: HistoryAccount, req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash) {
      return
    }

    this.saveTransactionPositionTokens(account.address, req)

    const id = transactionActivityId(hash)
    const activity = this.dependencies.history.get(id)
    if (!activity) {
      return
    }

    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))

    this.dependencies.history.update(id, {
      display,
      data: cloneSerializable(req.data),
      payload: cloneSerializable(req.payload),
      decodedData: cloneSerializable(req.decodedData),
      tokenData: cloneSerializable(req.tokenData),
      chainData: cloneSerializable(req.chainData),
      simulation: cloneSerializable(req.simulation),
      recognizedActions: cloneSerializable(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      updatedAt: this.dependencies.clock.now()
    })

    this.materializeAccountRelativeActivity(req)

    const notificationId = transactionNotificationId(hash)
    const notification = this.dependencies.notifications.get(notificationId)
    if (!notification) {
      return
    }

    const update = {
      title: display.title,
      detail: shortHash(hash),
      updatedAt: notification.updatedAt,
      expiresAt: notification.expiresAt,
      hidden: notification.hidden
    }

    if (notification.state === 'pending') {
      this.dependencies.notifications.pending({
        ...notification,
        ...update,
        id: notificationId
      })
    } else {
      this.dependencies.notifications.resolve(notificationId, notification.state, update)
    }
  }

  private updateTransactionActivity(req: TransactionRequest, confirmations: number) {
    const hash = req.tx?.hash
    if (!hash) {
      return
    }

    const receipt = cloneSerializable(req.tx?.receipt)
    const receiptStatus = req.tx?.receipt?.status

    if (receiptStatus === '0x0') {
      return this.finalizeTransactionActivity(req, 'reverted', {
        receipt,
        confirmations
      })
    }

    this.dependencies.history.update(transactionActivityId(hash), {
      status: 'confirming',
      confirmations,
      receipt,
      display: this.getTransactionActivityDisplay(req, this.getTransactionChain(req)),
      decodedData: cloneSerializable(req.decodedData),
      tokenData: cloneSerializable(req.tokenData),
      chainData: cloneSerializable(req.chainData),
      simulation: cloneSerializable(req.simulation),
      recognizedActions: cloneSerializable(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      updatedAt: this.dependencies.clock.now()
    })
  }

  private finalizeTransactionActivity(
    req: TransactionRequest,
    status: 'succeeded' | 'reverted',
    update: {
      completedAt?: number
      confirmations?: number
      receipt?: unknown
      updatedAt?: number
    } = {}
  ) {
    const hash = req.tx?.hash
    if (!hash) {
      return
    }

    const now = this.dependencies.clock.now()
    const notificationState = status === 'succeeded' ? 'completed' : 'failed'
    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))
    const gasSpent = req.safeTxHash ? null : getPaidTransactionFee(req)
    const balanceChanges =
      status === 'succeeded'
        ? getTransactionEffects(req, this.getTransactionNativeSymbol(req)).filter(isBalanceChange)
        : []

    this.dependencies.history.finalize(transactionActivityId(hash), status, {
      ...update,
      display,
      gasSpent,
      balanceChanges: cloneSerializable(balanceChanges),
      decodedData: cloneSerializable(req.decodedData),
      tokenData: cloneSerializable(req.tokenData),
      chainData: cloneSerializable(req.chainData),
      simulation: cloneSerializable(req.simulation),
      recognizedActions: cloneSerializable(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      receipt: update.receipt ?? cloneSerializable(req.tx?.receipt),
      confirmations: update.confirmations ?? req.tx?.confirmations ?? 0,
      completedAt: update.completedAt ?? now,
      updatedAt: update.updatedAt ?? now
    })

    if (status === 'succeeded') {
      this.materializeAccountRelativeActivity(req)
    }

    this.dependencies.notifications.resolve(transactionNotificationId(hash), notificationState, {
      title: display.title,
      detail: shortHash(hash),
      expiresAt: now + 3000,
      updatedAt: now
    })
    this.stopActivityMonitor(transactionActivityId(hash))
    this.stopRequestActivityMonitor(transactionActivityId(hash))
  }

  private pruneTransactionActivity(req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash) {
      return
    }

    const activityId = transactionActivityId(hash)
    this.dependencies.history.prune(activityId)
    this.stopActivityMonitor(activityId)
    this.stopRequestActivityMonitor(activityId)
  }

  private receiptWasReverted(req: TransactionRequest) {
    return unknownRecord(req.tx?.receipt).status === '0x0'
  }

  private transactionChainId(req: TransactionRequest) {
    return normalizeChainId(req.data.chainId)
  }

  private transactionNonce(req: TransactionRequest) {
    return normalizeQuantity(req.data.nonce)
  }

  private inSameNonceLane(a: TransactionRequest, b: TransactionRequest) {
    const aChainId = this.transactionChainId(a)
    const bChainId = this.transactionChainId(b)
    const aNonce = this.transactionNonce(a)
    const bNonce = this.transactionNonce(b)

    return Boolean(aChainId && bChainId && aChainId === bChainId && aNonce && bNonce && aNonce === bNonce)
  }

  private activityChainId(activity: ActivityRecord) {
    const dataChainId = unknownRecord(activity.data).chainId
    return normalizeChainId(
      activity.chainId ??
        (typeof dataChainId === 'string' || typeof dataChainId === 'number' ? dataChainId : undefined)
    )
  }

  private activityNonce(activity: ActivityRecord) {
    const dataNonce = unknownRecord(activity.data).nonce
    return normalizeQuantity(
      activity.nonce ??
        (typeof dataNonce === 'string' || typeof dataNonce === 'number' ? dataNonce : undefined)
    )
  }

  private activityAccount(activity: ActivityRecord) {
    const dataFrom = unknownRecord(activity.data).from
    return (
      activity.account ??
      activity.address ??
      (typeof dataFrom === 'string' ? dataFrom : '')
    ).toLowerCase()
  }

  private isNonTerminalActivity(activity?: ActivityRecord) {
    return activity?.status === 'submitted' || activity?.status === 'confirming'
  }

  private getActivityChain(activity: ActivityRecord): Chain | undefined {
    const chainId = this.activityChainId(activity)
    if (!chainId) {
      return undefined
    }

    return {
      type: 'ethereum',
      id: chainId
    }
  }

  private toActivityRequest(activity: ActivityRecord): TransactionRequest {
    const chainId = this.activityChainId(activity)
    const activityData = unknownRecord(activity.data)
    const safeMetadata = unknownRecord(unknownRecord(activity.metadata).safe)
    const data = {
      ...activityData,
      chainId: activityData.chainId ?? (chainId ? addHexPrefix(chainId.toString(16)) : undefined),
      nonce: activityData.nonce ?? activity.nonce
    }

    return {
      type: 'transaction',
      handlerId: activity.handlerId ?? activity.id,
      origin: (activity.origin as string) || this.dependencies.internalOriginId,
      account: this.activityAccount(activity),
      payload: activity.payload
        ? (activity.payload as RPC.SendTransaction.Request)
        : ({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            params: [data]
          } as RPC.SendTransaction.Request),
      data,
      ...(typeof safeMetadata.safeTxHash === 'string'
        ? {
            safeTxHash: safeMetadata.safeTxHash,
            safeExecution: unknownRecord(safeMetadata.outer) as TransactionRequest['safeExecution']
          }
        : {}),
      decodedData: activity.decodedData,
      tokenData: activity.tokenData,
      chainData: activity.chainData,
      simulation: activity.simulation,
      tx: {
        hash: activity.hash ?? undefined,
        receipt: activity.receipt as TransactionReceipt,
        confirmations: Number(activity.confirmations ?? 0)
      },
      approvals: [],
      status: activity.status === 'confirming' ? RequestStatus.Confirming : RequestStatus.Verifying,
      mode: RequestMode.Monitor,
      notice: activity.status === 'confirming' ? 'Confirming' : 'Verifying',
      feesUpdatedByUser: false,
      recipient: activity.recipient,
      recipientType: activity.recipientType ?? '',
      recognizedActions: activity.recognizedActions ?? [],
      classification: activity.classification
    } as unknown as TransactionRequest
  }

  private async getActivityReceiptConfirmations(
    activity: ActivityRecord,
    targetChain: Chain,
    isCurrentMonitor: () => boolean
  ) {
    return new Promise<{ confirmations: number; receipt?: TransactionReceipt; paused?: boolean }>(
      (resolve, reject) => {
        const targetChainId = addHexPrefix(targetChain.id.toString(16))

        if (!isCurrentMonitor()) {
          return resolve({ confirmations: 0, paused: true })
        }

        this.sendRequest(
          { method: 'eth_getTransactionReceipt', params: [activity.hash], chainId: targetChainId },
          (receiptRes: RPCResponsePayload) => {
            if (!isCurrentMonitor()) {
              return resolve({ confirmations: 0, paused: true })
            }
            if (receiptRes.error) {
              return reject(receiptRes.error)
            }

            const receipt = receiptRes.result as TransactionReceipt | undefined
            if (!receipt) {
              return resolve({ confirmations: Number(activity.confirmations ?? 0) })
            }

            this.sendRequest(
              { method: 'eth_blockNumber', params: [], chainId: targetChainId },
              (blockRes: RPCResponsePayload) => {
                if (!isCurrentMonitor()) {
                  return resolve({ confirmations: 0, paused: true })
                }
                if (blockRes.error) {
                  return reject(new Error(JSON.stringify(blockRes.error)))
                }

                const blockHeight = parseInt(blockRes.result as string, 16)
                const receiptBlock = parseInt(receipt.blockNumber, 16)

                resolve({
                  confirmations: Math.max(blockHeight - receiptBlock, 0),
                  receipt
                })
              }
            )
          }
        )
      }
    )
  }

  private pruneSameNonceActivityLosers(winningActivity: ActivityRecord) {
    const winnerHash = (winningActivity.hash ?? '').toLowerCase()
    const winnerAccount = this.activityAccount(winningActivity)
    const winnerChainId = this.activityChainId(winningActivity)
    const winnerNonce = this.activityNonce(winningActivity)

    if (!winnerHash || !winnerAccount || !winnerChainId || !winnerNonce) {
      return
    }

    const activity = this.dependencies.history.list()
    activity.forEach((candidate) => {
      if (!this.isNonTerminalActivity(candidate)) {
        return
      }
      if ((candidate.hash ?? '').toLowerCase() === winnerHash) {
        return
      }
      if (this.activityAccount(candidate) !== winnerAccount) {
        return
      }
      if (this.activityChainId(candidate) !== winnerChainId) {
        return
      }
      if (this.activityNonce(candidate) !== winnerNonce) {
        return
      }

      this.dependencies.history.prune(candidate.id)
      this.stopActivityMonitor(candidate.id)
      this.stopRequestActivityMonitor(candidate.id)
    })
  }

  private stopActivityMonitor(id: string) {
    this.activityMonitors[id]?.stop()
    delete this.activityMonitors[id]
  }

  private isCurrentActivityMonitor(id: string, token: symbol, accountId: string) {
    return (
      this.activityMonitors[id]?.token === token &&
      this.dependencies.wallet.isActiveProfileAccount(accountId) &&
      this.isNonTerminalActivity(this.dependencies.history.get(id))
    )
  }

  private resumeActivityMonitor(activity: ActivityRecord) {
    if (
      !activity.id ||
      this.activityMonitors[activity.id] ||
      this.requestActivityMonitors[activity.id] ||
      !activity.hash
    ) {
      return
    }
    if (!this.isNonTerminalActivity(activity)) {
      return
    }

    const accountId = this.activityAccount(activity)
    if (!accountId || !this.dependencies.wallet.isActiveProfileAccount(accountId)) {
      return
    }

    const token = Symbol(activity.id)
    let inFlight = false

    const monitor = async () => {
      if (inFlight || !this.isCurrentActivityMonitor(activity.id, token, accountId)) {
        return
      }

      const currentActivity = this.dependencies.history.get(activity.id)
      if (!this.isNonTerminalActivity(currentActivity) || !currentActivity?.hash) {
        return this.stopActivityMonitor(activity.id)
      }

      const targetChain = this.getActivityChain(currentActivity)
      if (!targetChain) {
        return this.stopActivityMonitor(activity.id)
      }

      inFlight = true
      try {
        const { confirmations, receipt, paused } = await this.getActivityReceiptConfirmations(
          currentActivity,
          targetChain,
          () => this.isCurrentActivityMonitor(activity.id, token, accountId)
        )
        if (paused || !this.isCurrentActivityMonitor(activity.id, token, accountId)) {
          return
        }
        if (!receipt) {
          return
        }

        const txRequest = this.toActivityRequest({
          ...currentActivity,
          confirmations,
          receipt
        })
        txRequest.tx = {
          ...txRequest.tx,
          confirmations,
          receipt
        }

        this.refreshTransactionPositions(txRequest)

        this.pruneSameNonceActivityLosers(currentActivity)

        if (unknownRecord(receipt).status === '0x0') {
          this.finalizeTransactionActivity(txRequest, 'reverted', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
          this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        this.dependencies.history.update(activity.id, {
          status: 'confirming',
          confirmations,
          receipt,
          updatedAt: this.dependencies.clock.now()
        })
      } catch (e) {
        if (this.isCurrentActivityMonitor(activity.id, token, accountId)) {
          log.error('error resuming activity transaction monitor', e)
        }
      } finally {
        inFlight = false
      }
    }

    const stop = this.dependencies.timers.every(() => {
      void monitor()
    }, 15 * 1000)
    this.activityMonitors[activity.id] = {
      accountId,
      token,
      stop
    }
    void monitor()
  }

  private resumeActivityTracking() {
    const activity = this.dependencies.history.list()

    activity.forEach((record) => {
      this.resumeActivityMonitor(record)
    })
  }

  private async confirmations(
    account: HistoryRequestHandle,
    id: string,
    hash: string,
    targetChain: Chain,
    isCurrentMonitor: () => boolean = () => true
  ) {
    return new Promise<number>((resolve, reject) => {
      const targetChainId = addHexPrefix(targetChain.id.toString(16))

      if (!isCurrentMonitor()) {
        return resolve(-1)
      }

      this.sendRequest(
        { method: 'eth_blockNumber', params: [], chainId: targetChainId },
        (res: RPCResponsePayload) => {
          if (!isCurrentMonitor()) {
            return resolve(-1)
          }
          if (res.error) {
            return reject(new Error(JSON.stringify(res.error)))
          }

          this.sendRequest(
            { method: 'eth_getTransactionReceipt', params: [hash], chainId: targetChainId },
            (receiptRes: RPCResponsePayload) => {
              if (!isCurrentMonitor()) {
                return resolve(-1)
              }
              if (receiptRes.error) {
                return reject(receiptRes.error)
              }
              if (!account.exists()) {
                return reject(new Error('account closed'))
              }

              const receipt = transactionReceiptValue(receiptRes.result)
              if (receipt && account.list()[id]) {
                let txRequest = account.patch(id, (request) => {
                  request.tx = {
                    ...request.tx,
                    receipt,
                    confirmations: request.tx?.confirmations ?? 0
                  }
                })
                if (!txRequest) {
                  return reject(new Error('request closed'))
                }

                this.refreshTransactionPositions(txRequest)

                if (!txRequest.feeAtTime) {
                  const chain = targetChain
                  if (chain.id === 1) {
                    const ethPrice = this.dependencies.wallet.ethereumUsdRate()

                    if (ethPrice && txRequest.tx?.receipt && account.exists()) {
                      const { gasUsed } = txRequest.tx.receipt

                      const feeAtTime = (
                        Math.round(
                          weiIntToEthInt(
                            hexToInt(gasUsed) *
                              hexToInt(txRequest.data.gasPrice ?? '0x0') *
                              Number(unknownRecord(res.result).ethusd)
                          ) * 100
                        ) / 100
                      ).toFixed(2)
                      txRequest = account.patch(id, (request) => {
                        request.feeAtTime = feeAtTime
                      })
                    }
                  } else {
                    txRequest = account.patch(id, (request) => {
                      request.feeAtTime = '?'
                    })
                  }
                }

                const blockHeight = parseInt(res.result as string, 16)
                const receiptBlock = parseInt(receipt.blockNumber, 16)
                const confirmations = blockHeight - receiptBlock

                txRequest = account.patch(id, (request) => {
                  request.tx = { ...request.tx, confirmations }
                })
                if (!txRequest) {
                  return reject(new Error('request closed'))
                }

                this.updateTransactionActivity(txRequest, confirmations)

                const receiptStatus = unknownRecord(receiptRes.result).status

                if (receiptStatus === '0x0' && txRequest.status === RequestStatus.Verifying) {
                  txRequest = account.patch(id, (request) => {
                    request.status = RequestStatus.Error
                    request.notice = 'Reverted'
                    request.completed = this.dependencies.clock.now()
                  })
                  if (!txRequest) {
                    return reject(new Error('request closed'))
                  }
                }

                if (receiptStatus && txRequest.data.nonce) {
                  this.pruneSameNonceActivityLosers(
                    this.transactionActivityRecord(account, id, txRequest, hash)
                  )

                  Object.keys(account.list()).forEach((k) => {
                    if (k === id) {
                      return
                    }

                    const maybeTxReq = account.list()[k]
                    if (maybeTxReq?.type !== 'transaction') {
                      return
                    }

                    const txReq = maybeTxReq as TransactionRequest
                    const canStillBePending =
                      !txReq.tx?.receipt &&
                      [RequestStatus.Verifying, RequestStatus.Sent, RequestStatus.Sending].includes(
                        txReq.status as RequestStatus
                      )

                    if (canStillBePending && this.inSameNonceLane(txReq, txRequest!)) {
                      this.pruneTransactionActivity(txReq)
                      account.patch(k, (request) => {
                        request.status = RequestStatus.Error
                        request.notice = 'Dropped'
                      })
                      this.dependencies.timers.schedule(() => account.exists() && account.remove(k), 8000)
                    }
                  })
                }

                if (receiptStatus === '0x1' && txRequest.status === RequestStatus.Verifying) {
                  txRequest = account.patch(id, (request) => {
                    request.status = RequestStatus.Confirming
                    request.notice = 'Confirming'
                    request.completed = this.dependencies.clock.now()
                  })
                  if (!txRequest) {
                    return reject(new Error('request closed'))
                  }
                  const hash = txRequest.tx?.hash ?? ''
                  const body = `Transaction ${shortHash(hash)} successful! \n Click for details`

                  this.dependencies.notifications.native('Transaction Successful', body, () => {
                    this.dependencies.notifications.openExplorer(targetChain, hash)
                  })
                }
                resolve(confirmations)
              }
            }
          )
        }
      )
    })
  }

  private stopRequestActivityMonitor(id: string) {
    this.requestActivityMonitors[id]?.stop()
    delete this.requestActivityMonitors[id]
  }

  private isCurrentRequestActivityMonitor(id: string, token: symbol, accountId: string) {
    return (
      this.requestActivityMonitors[id]?.token === token &&
      this.dependencies.wallet.isActiveProfileAccount(accountId)
    )
  }

  private canApplyRequestMonitorResult(id: string, confirmations: number, isCurrent: () => boolean) {
    if (confirmations < 0) {
      return false
    }
    if (isCurrent()) {
      return true
    }

    const status = this.dependencies.history.get(id)?.status
    return status === 'succeeded' || status === 'reverted'
  }

  async monitorRequest(account: HistoryRequestHandle, requestId: string, hash: string) {
    const activityId = transactionActivityId(hash)
    const accountId = account.address.toLowerCase()
    if (
      !this.dependencies.wallet.isActiveProfileAccount(accountId) ||
      this.requestActivityMonitors[activityId]
    ) {
      return
    }

    const token = Symbol(activityId)
    this.requestActivityMonitors[activityId] = { accountId, token, stop: () => {} }
    const isCurrentMonitor = () => this.isCurrentRequestActivityMonitor(activityId, token, accountId)
    const installStop = (stop: () => void) => {
      const current = this.requestActivityMonitors[activityId]
      if (current?.token === token) {
        current.stop = stop
      } else {
        stop()
      }
    }

    const request = account.get(requestId)
    if (!request) {
      this.stopRequestActivityMonitor(activityId)
      return
    }
    const rawTx = request.data
    account.patch(requestId, (request) => {
      request.tx = { hash, confirmations: 0 }
    })

    const isChainAvailable = (status: string) => !['disconnected', 'degraded'].includes(status.toLowerCase())

    const setTxSent = () => {
      account.patch(requestId, (request) => {
        request.status = RequestStatus.Sent
        request.notice = 'Sent'
        if (request.tx) {
          request.tx.confirmations = 0
        }
      })
    }

    if (!rawTx.chainId) {
      log.error('txMonitor had no target chain')
      this.dependencies.timers.schedule(() => account.exists() && account.remove(requestId), 8 * 1000)
      this.stopRequestActivityMonitor(activityId)
    } else {
      const targetChain: Chain = {
        type: 'ethereum',
        id: parseInt(rawTx.chainId, 16)
      }

      const targetChainId = addHexPrefix(targetChain.id.toString(16))
      this.sendRequest(
        { method: 'eth_subscribe', params: ['newHeads'], chainId: targetChainId },
        (newHeadRes: RPCResponsePayload) => {
          if (!isCurrentMonitor()) {
            if (newHeadRes.result) {
              this.sendRequest(
                { method: 'eth_unsubscribe', chainId: targetChainId, params: [newHeadRes.result] },
                () => {}
              )
            }
            return
          }

          if (newHeadRes.error) {
            log.warn(newHeadRes.error)
            const monitor = async () => {
              if (!isCurrentMonitor() || !account.exists()) {
                this.stopRequestActivityMonitor(activityId)
                return
              }

              let confirmations
              try {
                confirmations = await this.confirmations(
                  account,
                  requestId,
                  hash,
                  targetChain,
                  isCurrentMonitor
                )
                if (!this.canApplyRequestMonitorResult(activityId, confirmations, isCurrentMonitor)) {
                  return
                }
                let txRequest = account.get(requestId)
                if (!txRequest) {
                  this.stopRequestActivityMonitor(activityId)
                  return
                }

                if (this.receiptWasReverted(txRequest)) {
                  this.dependencies.timers.schedule(
                    () => account.exists() && account.remove(requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  this.stopRequestActivityMonitor(activityId)
                  return
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest = account.patch(requestId, (request) => {
                    request.status = RequestStatus.Confirmed
                    request.notice = 'Confirmed'
                  })
                  if (txRequest) {
                    this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })
                  }
                  this.dependencies.timers.schedule(
                    () => account.exists() && account.remove(requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  this.stopRequestActivityMonitor(activityId)
                }
              } catch (e) {
                if (!isCurrentMonitor()) {
                  return
                }
                log.error('error awaiting confirmations', e)
                this.stopRequestActivityMonitor(activityId)
                setTxSent()
                this.dependencies.timers.schedule(
                  () => account.exists() && account.remove(requestId),
                  60 * 1000
                )
              }
            }

            const runMonitor = () => {
              void monitor()
            }
            this.dependencies.timers.schedule(runMonitor, 1000)
            const stopTimer = this.dependencies.timers.every(runMonitor, 1000)

            const statusHandler = (status: string) => {
              if (!isChainAvailable(status)) {
                setTxSent()
                this.stopRequestActivityMonitor(activityId)
              }
            }

            const { type, id } = targetChain

            this.dependencies.rpc.on(`status:${type}:${id}`, statusHandler)

            const clear = () => {
              stopTimer()
              this.dependencies.rpc.off(`status:${type}:${id}`, statusHandler)
            }
            installStop(clear)
          } else if (newHeadRes.result) {
            const headSub: unknown = newHeadRes.result
            let stopped = false

            const removeSubscription = (requestRemoveTimeout: number) => {
              this.dependencies.timers.schedule(
                () => account.exists() && account.remove(requestId),
                requestRemoveTimeout
              )
              this.stopRequestActivityMonitor(activityId)
            }

            const statusHandler = (status: string) => {
              if (!isChainAvailable(status)) {
                setTxSent()
                removeSubscription(60 * 1000)
              }
            }

            const handleHead = async (payload: RPCRequestPayload) => {
              if (!isCurrentMonitor()) {
                return
              }
              if (
                payload.method === 'eth_subscription' &&
                unknownRecord(payload.params).subscription === headSub
              ) {
                let confirmations
                try {
                  confirmations = await this.confirmations(
                    account,
                    requestId,
                    hash,
                    targetChain,
                    isCurrentMonitor
                  )
                  if (!this.canApplyRequestMonitorResult(activityId, confirmations, isCurrentMonitor)) {
                    return
                  }
                } catch (e) {
                  if (!isCurrentMonitor()) {
                    return
                  }
                  log.error(e)

                  setTxSent()
                  return removeSubscription(60 * 1000)
                }

                let txRequest = account.get(requestId)
                if (!txRequest) {
                  return removeSubscription(0)
                }

                if (this.receiptWasReverted(txRequest)) {
                  return removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest = account.patch(requestId, (request) => {
                    request.status = RequestStatus.Confirmed
                    request.notice = 'Confirmed'
                  })
                  if (txRequest) {
                    this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })
                  }

                  removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }
              }
            }

            const { type, id } = targetChain

            const handler = (payload: RPCRequestPayload) => {
              handleHead(payload).catch((error: unknown) => {
                log.error('Could not monitor transaction subscription', error)
                if (isCurrentMonitor()) {
                  setTxSent()
                  removeSubscription(60 * 1000)
                }
              })
            }
            this.dependencies.rpc.on(`status:${type}:${id}`, statusHandler)
            this.dependencies.rpc.on(`data:${type}:${id}`, handler)
            installStop(() => {
              if (stopped) {
                return
              }
              stopped = true
              this.dependencies.rpc.off(`data:${targetChain.type}:${targetChain.id}`, handler)
              this.dependencies.rpc.off(`status:${targetChain.type}:${targetChain.id}`, statusHandler)
              this.sendRequest(
                { method: 'eth_unsubscribe', chainId: targetChainId, params: [headSub] },
                (res: RPCResponsePayload) => {
                  if (res.error) {
                    log.error('error sending message eth_unsubscribe', res)
                  }
                }
              )
            })
          }
        }
      )
    }
  }

  stopAccount(address: string) {
    const normalizedAddress = address.toLowerCase()
    Object.entries(this.activityMonitors).forEach(([id, monitor]) => {
      if (monitor?.accountId === normalizedAddress) {
        this.stopActivityMonitor(id)
      }
    })
    Object.entries(this.requestActivityMonitors).forEach(([id, monitor]) => {
      if (monitor?.accountId === normalizedAddress) {
        this.stopRequestActivityMonitor(id)
      }
    })
  }
}
