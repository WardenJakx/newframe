import EventEmitter from 'events'
import log from 'electron-log'
import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { v5 as uuidv5 } from 'uuid'

import FrameAccount from './Account.js'
import type { DataScanner } from '../../asset-data/main/externalData/index.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import Signer from '../../../platform/signing/signers/Signer/index.js'

import { weiIntToEthInt, hexToInt } from '../../../shared/domain/hex.js'
import {
  usesBaseFee,
  TransactionData,
  GasFeesSource,
  TRANSACTION_CONFIRMATION_TARGET,
  getTransactionIntent,
  getTransactionPositionTokens,
  getTransactionEffects,
  getPaidTransactionFee
} from '../../transactions/domain/index.js'
import { decideWalletAction, type TrustedPrincipal } from '../../access-control/main/authority.js'

import {
  AccountRequest,
  AccessRequest,
  TransactionRequest,
  TransactionReceipt,
  ReplacementType,
  RequestStatus,
  RequestMode,
  TypedMessage,
  PermitSignatureRequest
} from '../../requests/contract/requests.js'

import type { Chain } from '../../networks/main/index.js'
import { ActionType } from '../../transactions/main/actions/index.js'
import { ApprovalType } from '../../requests/domain/approval.js'
import { accountNS } from '../domain/index.js'
import { tokensForAccount, toTokenId } from '../../tokens/domain/index.js'
import { chainUsesOptimismFees } from '../../networks/domain/chain/fees.js'
import { resolveAssetRate } from '../../asset-data/domain/asset/index.js'
import { getProfileAccountIds } from '../../../app/contracts/state/main.js'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants.js'
import type { ActivityRecord, StatusNotification, Token } from '../../../platform/state-store/state/index.js'
import type { AccountChainRpcPort } from './providerPort.js'
import type { AccountTransactionPolicyPort } from '../../transactions/main/accountPolicyPort.js'
import type { TransactionSimulationPort } from '../../transactions/main/simulationPort.js'
import type { NameResolutionService } from '../../name-resolution/main/nameResolution.js'
import type { RevealService } from '../../transactions/main/reveal.js'
import type { AccountsRuntime } from './runtime.js'
import type { PromptedRequestLifecyclePort } from '../../requests/main/service.js'

function shortHash(hash?: string) {
  if (!hash) return ''
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`
}

function cloneForActivity(value: any) {
  if (value === undefined) return undefined

  try {
    return JSON.parse(
      JSON.stringify(value, (_key, nextValue) => {
        if (typeof nextValue === 'function') return undefined
        return nextValue
      })
    )
  } catch {
    return undefined
  }
}

function transactionActivityId(hash: string) {
  return hash
}

function transactionNotificationId(hash: string) {
  return `transaction:${hash}`
}

function normalizeQuantity(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return ''

  try {
    return BigInt(value).toString()
  } catch {
    return String(value).toLowerCase()
  }
}

function normalizeChainId(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return undefined

  const chainId = typeof value === 'string' ? parseInt(value, value.startsWith('0x') ? 16 : 10) : value
  return Number.isFinite(chainId) ? chainId : undefined
}

function toTransactionsByLayer(requests: Record<string, AccountRequest>, chainId?: number) {
  return Object.entries(requests)
    .filter(([_, req]) => req.type === 'transaction')
    .reduce(
      ({ l1Transactions, l2Transactions }, [id, req]) => {
        const txRequest = req as TransactionRequest
        if (
          !txRequest.locked &&
          !txRequest.feesUpdatedByUser &&
          txRequest.data.gasFeesSource === GasFeesSource.Frame &&
          (!chainId || parseInt(txRequest.data.chainId, 16) === chainId)
        ) {
          l1Transactions.push([id, txRequest])
        }

        if (chainUsesOptimismFees(parseInt(txRequest.data.chainId, 16))) {
          l2Transactions.push([id, txRequest])
        }

        return { l1Transactions, l2Transactions }
      },
      { l1Transactions: [] as RequestWithId[], l2Transactions: [] as RequestWithId[] }
    )
}

const frameOriginId = uuidv5('newframe-internal', uuidv5.DNS)
const CONFIRMED_REQUEST_CLOSE_MS = 3000

export type { AccountRequest, AccessRequest, TransactionRequest } from '../../requests/contract/requests.js'

type RequestWithId = [string, TransactionRequest]

export interface AccountsDependencies {
  chainRpc: AccountChainRpcPort
  transactionPolicy: AccountTransactionPolicyPort
  simulation: TransactionSimulationPort
  nameResolution: NameResolutionService
  reveal: RevealService
  runtime: AccountsRuntime
  createDataScanner: (store: CanonicalStoreReader) => DataScanner
  requests: PromptedRequestLifecyclePort
}

export class Accounts extends EventEmitter {
  accounts: Record<string, FrameAccount>

  private initialized = false
  private dataScanner?: DataScanner
  private activityMonitors: Record<string, { accountId: string; stop: () => void; token: symbol }> = {}
  private requestActivityMonitors: Record<string, { accountId: string; stop: () => void; token: symbol }> = {}
  private activeProfileAccountIds = new Set<string>()
  private profileObserver?: () => void
  private pendingPositionRefreshes = new Map<string, TransactionRequest>()
  private transactionPositionTokensByHash = new Map<string, Token[]>()
  private readonly storeApi = {
    getAccounts: () => (this.store.getState().main.accounts || {}) as unknown as Record<string, Account>,
    getAccount: (id: string) => (this.store.getState().main.accounts[id] || {}) as unknown as Account,
    getSigners: () => Object.values((this.store.getState().main.signers || {}) as Record<string, Signer>)
  }

  constructor(
    private readonly store: CanonicalStoreReader,
    private readonly dependencies: AccountsDependencies
  ) {
    super()

    this.accounts = {}
  }

  initialize() {
    if (this.initialized) return

    this.activeProfileAccountIds = this.readActiveProfileAccountIds()

    Object.entries(this.storeApi.getAccounts()).forEach(([id, account]) => {
      if (!this.accounts[id]) {
        this.accounts[id] = new FrameAccount(
          JSON.parse(JSON.stringify(account)),
          this,
          this.store,
          this.dependencies.chainRpc,
          this.dependencies.simulation,
          this.dependencies.nameResolution,
          this.dependencies.reveal,
          this.dependencies.runtime,
          this.dependencies.requests,
          this.isActiveProfileAccount(id)
        )
      }
    })

    this.resumeActivityTracking()
    this.profileObserver = this.store.subscribe(
      (state) => [state.main.currentProfile, state.main.accounts, state.main.accountOrder] as const,
      () => this.reconcileProfileNetworkOwners(),
      {
        equalityFn: (previous, current) =>
          previous[0] === current[0] && previous[1] === current[1] && previous[2] === current[2]
      }
    )
    this.initialized = true
  }

  start() {
    this.initialize()
  }

  get(id: string) {
    return this.storeApi.getAccounts()[id]
  }

  getFrameAccount(id: string) {
    return this.handle(id.toLowerCase())
  }

  private has(id: string) {
    return Boolean(this.storeApi.getAccounts()[id])
  }

  private handle(id: string) {
    const account = this.storeApi.getAccounts()[id]
    if (!account) return null

    if (!this.accounts[id]) {
      this.accounts[id] = new FrameAccount(
        JSON.parse(JSON.stringify(account)),
        this,
        this.store,
        this.dependencies.chainRpc,
        this.dependencies.simulation,
        this.dependencies.nameResolution,
        this.dependencies.reveal,
        this.dependencies.runtime,
        this.dependencies.requests,
        this.isActiveProfileAccount(id)
      )
    }

    return this.accounts[id]
  }

  private readActiveProfileAccountIds() {
    const main = this.store.getState().main
    return new Set(getProfileAccountIds(main, main.currentProfile).map((id) => id.toLowerCase()))
  }

  private isActiveProfileAccount(id: string) {
    const activeIds = this.initialized ? this.activeProfileAccountIds : this.readActiveProfileAccountIds()
    return activeIds.has(id.toLowerCase())
  }

  private reconcileProfileNetworkOwners() {
    const nextActiveIds = this.readActiveProfileAccountIds()
    this.activeProfileAccountIds = nextActiveIds

    Object.entries(this.accounts).forEach(([id, account]) => {
      account.setProfileActive(nextActiveIds.has(id.toLowerCase()))
    })

    Object.entries(this.activityMonitors).forEach(([id, monitor]) => {
      if (!nextActiveIds.has(monitor.accountId)) this.stopActivityMonitor(id)
    })
    Object.entries(this.requestActivityMonitors).forEach(([id, monitor]) => {
      if (!nextActiveIds.has(monitor.accountId)) this.stopRequestActivityMonitor(id)
    })

    this.resumeActivityTracking()
  }

  private getTransactionRequest(account: FrameAccount, id: string): TransactionRequest {
    return account.getRequest(id)
  }

  private getTransactionChain(req: TransactionRequest): Chain | undefined {
    const chainId = req.data?.chainId ? parseInt(req.data.chainId, 16) : 0
    if (!chainId) return undefined

    return {
      type: 'ethereum',
      id: chainId
    }
  }

  private getTransactionActivityDisplay(req: TransactionRequest, chain?: Chain) {
    const value = req.data?.value
    const network = chain ? (this.store.getState().main.networks.ethereum[chain.id] as any) : undefined
    const chainSymbol =
      network?.symbol ||
      (chain ? this.store.getState().main.networksMeta.ethereum[chain.id].nativeCurrency.symbol : '') ||
      'ETH'
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
    const network = chain ? (this.store.getState().main.networks.ethereum[chain.id] as any) : undefined
    const metadata = chain ? this.store.getState().main.networksMeta.ethereum[chain.id] : undefined

    return network?.symbol || metadata?.nativeCurrency.symbol || 'ETH'
  }

  private transactionActivityRecord(
    account: FrameAccount,
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
      chainId: chain?.id,
      chainType: chain?.type || 'ethereum',
      nonce: req.data?.nonce,
      origin: req.origin,
      submittedAt: this.dependencies.runtime.now(),
      updatedAt: this.dependencies.runtime.now(),
      status: 'submitted' as const,
      confirmations: req.tx?.confirmations || 0,
      receipt: cloneForActivity(req.tx?.receipt),
      data: cloneForActivity(req.data),
      payload: cloneForActivity(req.payload),
      decodedData: cloneForActivity(req.decodedData),
      tokenData: cloneForActivity(req.tokenData),
      chainData: cloneForActivity(req.chainData),
      simulation: cloneForActivity(req.simulation),
      recognizedActions: cloneForActivity(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      display
    }
  }

  private upsertTransactionNotification(account: FrameAccount, req: TransactionRequest, hash: string) {
    const chain = this.getTransactionChain(req)
    const display = this.getTransactionActivityDisplay(req, chain)
    const now = this.dependencies.runtime.now()

    this.store.getState().upsertPendingNotification({
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
        chainType: chain?.type || 'ethereum'
      }
    })
  }

  private recordSubmittedTransaction(
    account: FrameAccount,
    handlerId: string,
    req: TransactionRequest,
    hash: string
  ) {
    const positionTokens = this.saveTransactionPositionTokens(account.address, req)
    this.transactionPositionTokensByHash.set(hash, positionTokens)
    this.store
      .getState()
      .upsertSubmittedActivity(this.transactionActivityRecord(account, handlerId, req, hash))
    this.upsertTransactionNotification(account, req, hash)
  }

  private transactionPositionTokens(req: TransactionRequest) {
    return getTransactionPositionTokens(req) as Token[]
  }

  private savePositionTokens(address: Address, affectedTokens: Token[]) {
    const savedTokens = tokensForAccount(this.store.getState().main.tokens, address)
    const savedTokenIndex = new Map(savedTokens.map((token) => [toTokenId(token), token]))
    const tokens = affectedTokens.map((token) => {
      const savedToken = savedTokenIndex.get(toTokenId(token))

      return savedToken ? { ...token, ...savedToken } : token
    })
    const newTokens = tokens.filter((token) => !savedTokenIndex.has(toTokenId(token)))
    if (newTokens.length > 0) {
      this.store.getState().upsertTokens(newTokens, { account: address, source: 'transaction' })
    }

    return tokens
  }

  private saveTransactionPositionTokens(address: Address, req: TransactionRequest) {
    return this.savePositionTokens(address, this.transactionPositionTokens(req))
  }

  trackPositionTokens(address: Address, tokens: Token[]) {
    return this.savePositionTokens(address.toLowerCase() as Address, tokens)
  }

  refreshPositions(address: Address, chainId: number, tokens: Token[]) {
    const normalizedAddress = address.toLowerCase() as Address
    const trackedTokens = this.savePositionTokens(normalizedAddress, tokens)

    if (!this.dataScanner) return false

    this.dataScanner.refreshPositions(normalizedAddress, chainId, trackedTokens)
    return true
  }

  private refreshTransactionPositions(req: TransactionRequest) {
    const hash = req.tx?.hash
    const chainId = this.transactionChainId(req)
    const address = (req.account || req.data?.from || '').toLowerCase() as Address
    if (!hash || !chainId || !address || !req.tx?.receipt) return

    const activity = this.store.getState().main.activity[transactionActivityId(hash)] as
      | ActivityRecord
      | undefined
    if (activity?.positionsRefreshedAt) return

    const requestTokens = this.transactionPositionTokens(req)
    const tokens = requestTokens.length
      ? requestTokens
      : this.transactionPositionTokensByHash.get(hash) ||
        (activity ? this.transactionPositionTokens(activity as unknown as TransactionRequest) : [])
    if (!this.refreshPositions(address, chainId, tokens)) {
      this.pendingPositionRefreshes.set(hash, req)
      return
    }

    this.store
      .getState()
      .updateActivity(transactionActivityId(hash), { positionsRefreshedAt: this.dependencies.runtime.now() })
    this.pendingPositionRefreshes.delete(hash)
    this.transactionPositionTokensByHash.delete(hash)
  }

  syncTransactionActivity(account: FrameAccount, req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash) return

    this.saveTransactionPositionTokens(account.address, req)

    const id = transactionActivityId(hash)
    const activity = this.store.getState().main.activity[id]
    if (!activity) return

    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))

    this.store.getState().updateActivity(id, {
      display,
      data: cloneForActivity(req.data),
      payload: cloneForActivity(req.payload),
      decodedData: cloneForActivity(req.decodedData),
      tokenData: cloneForActivity(req.tokenData),
      chainData: cloneForActivity(req.chainData),
      simulation: cloneForActivity(req.simulation),
      recognizedActions: cloneForActivity(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      updatedAt: this.dependencies.runtime.now()
    })

    const notificationId = transactionNotificationId(hash)
    const notifications = this.store.getState().view.notifications as unknown as Record<
      string,
      StatusNotification
    >
    const notification = notifications[notificationId]
    if (!notification) return

    const update = {
      title: display.title,
      detail: shortHash(hash),
      updatedAt: notification.updatedAt,
      expiresAt: notification.expiresAt,
      hidden: notification.hidden
    }

    if (notification.state === 'pending') {
      this.store.getState().upsertPendingNotification({
        ...notification,
        ...update,
        id: notificationId
      })
    } else {
      this.store.getState().resolveNotification(notificationId, notification.state, update)
    }
  }

  private updateTransactionActivity(req: TransactionRequest, confirmations: number) {
    const hash = req.tx?.hash
    if (!hash) return

    const receipt = cloneForActivity(req.tx?.receipt)
    const receiptStatus = (req.tx?.receipt as any)?.status

    if (receiptStatus === '0x0') {
      return this.finalizeTransactionActivity(req, 'reverted', {
        receipt,
        confirmations
      })
    }

    this.store.getState().updateActivity(transactionActivityId(hash), {
      status: 'confirming',
      confirmations,
      receipt,
      display: this.getTransactionActivityDisplay(req, this.getTransactionChain(req)),
      decodedData: cloneForActivity(req.decodedData),
      tokenData: cloneForActivity(req.tokenData),
      chainData: cloneForActivity(req.chainData),
      simulation: cloneForActivity(req.simulation),
      recognizedActions: cloneForActivity(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      updatedAt: this.dependencies.runtime.now()
    })
  }

  private finalizeTransactionActivity(
    req: TransactionRequest,
    status: 'succeeded' | 'reverted',
    update: any = {}
  ) {
    const hash = req.tx?.hash
    if (!hash) return

    const now = this.dependencies.runtime.now()
    const notificationState = status === 'succeeded' ? 'completed' : 'failed'
    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))
    const gasSpent = getPaidTransactionFee(req)
    const balanceChanges =
      status === 'succeeded'
        ? getTransactionEffects(req, this.getTransactionNativeSymbol(req)).filter(
            (effect) => effect.direction === 'in' || effect.direction === 'out'
          )
        : []

    this.store.getState().finalizeActivity(transactionActivityId(hash), status, {
      ...update,
      display,
      gasSpent,
      balanceChanges: cloneForActivity(balanceChanges),
      decodedData: cloneForActivity(req.decodedData),
      tokenData: cloneForActivity(req.tokenData),
      chainData: cloneForActivity(req.chainData),
      simulation: cloneForActivity(req.simulation),
      recognizedActions: cloneForActivity(req.recognizedActions),
      classification: req.classification,
      recipient: req.recipient,
      recipientType: req.recipientType,
      receipt: update.receipt ?? cloneForActivity(req.tx?.receipt),
      confirmations: update.confirmations ?? req.tx?.confirmations ?? 0,
      completedAt: update.completedAt ?? now,
      updatedAt: update.updatedAt ?? now
    })

    this.store.getState().resolveNotification(transactionNotificationId(hash), notificationState, {
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
    if (!hash) return

    const activityId = transactionActivityId(hash)
    this.store.getState().pruneActivity(activityId)
    this.stopActivityMonitor(activityId)
    this.stopRequestActivityMonitor(activityId)
  }

  private receiptWasReverted(req: TransactionRequest) {
    return (req.tx?.receipt as any)?.status === '0x0'
  }

  private transactionChainId(req: TransactionRequest) {
    return normalizeChainId(req.data?.chainId)
  }

  private transactionNonce(req: TransactionRequest) {
    return normalizeQuantity(req.data?.nonce)
  }

  private inSameNonceLane(a: TransactionRequest, b: TransactionRequest) {
    const aChainId = this.transactionChainId(a)
    const bChainId = this.transactionChainId(b)
    const aNonce = this.transactionNonce(a)
    const bNonce = this.transactionNonce(b)

    return Boolean(aChainId && bChainId && aChainId === bChainId && aNonce && bNonce && aNonce === bNonce)
  }

  private activityChainId(activity: ActivityRecord) {
    return normalizeChainId(activity.chainId ?? (activity.data as any)?.chainId)
  }

  private activityNonce(activity: ActivityRecord) {
    return normalizeQuantity(activity.nonce ?? (activity.data as any)?.nonce)
  }

  private activityAccount(activity: ActivityRecord) {
    return (activity.account || activity.address || (activity.data as any)?.from || '').toLowerCase()
  }

  private isNonTerminalActivity(activity?: ActivityRecord) {
    return activity?.status === 'submitted' || activity?.status === 'confirming'
  }

  private getActivityChain(activity: ActivityRecord): Chain | undefined {
    const chainId = this.activityChainId(activity)
    if (!chainId) return undefined

    return {
      type: 'ethereum',
      id: chainId
    }
  }

  private toActivityRequest(activity: ActivityRecord): TransactionRequest {
    const chainId = this.activityChainId(activity)
    const data = {
      ...((activity.data as any) || {}),
      chainId: (activity.data as any)?.chainId || (chainId ? addHexPrefix(chainId.toString(16)) : undefined),
      nonce: (activity.data as any)?.nonce || activity.nonce
    }

    return {
      type: 'transaction',
      handlerId: activity.handlerId || activity.id,
      origin: (activity.origin as string) || frameOriginId,
      account: this.activityAccount(activity),
      payload:
        (activity.payload as RPC.SendTransaction.Request) ||
        ({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_sendTransaction',
          params: [data]
        } as RPC.SendTransaction.Request),
      data,
      decodedData: activity.decodedData,
      tokenData: activity.tokenData,
      chainData: activity.chainData,
      simulation: activity.simulation,
      tx: {
        hash: activity.hash || undefined,
        receipt: activity.receipt as TransactionReceipt,
        confirmations: Number(activity.confirmations || 0)
      },
      approvals: [],
      status: activity.status === 'confirming' ? RequestStatus.Confirming : RequestStatus.Verifying,
      mode: RequestMode.Monitor,
      notice: activity.status === 'confirming' ? 'Confirming' : 'Verifying',
      feesUpdatedByUser: false,
      recipient: activity.recipient,
      recipientType: activity.recipientType || '',
      recognizedActions: activity.recognizedActions || [],
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

        if (!isCurrentMonitor()) return resolve({ confirmations: 0, paused: true })

        this.sendRequest(
          { method: 'eth_getTransactionReceipt', params: [activity.hash], chainId: targetChainId },
          (receiptRes: RPCResponsePayload) => {
            if (!isCurrentMonitor()) return resolve({ confirmations: 0, paused: true })
            if (receiptRes.error) return reject(receiptRes.error)

            const receipt = receiptRes.result as TransactionReceipt | undefined
            if (!receipt) {
              return resolve({ confirmations: Number(activity.confirmations || 0) })
            }

            this.sendRequest(
              { method: 'eth_blockNumber', params: [], chainId: targetChainId },
              (blockRes: RPCResponsePayload) => {
                if (!isCurrentMonitor()) return resolve({ confirmations: 0, paused: true })
                if (blockRes.error) return reject(new Error(JSON.stringify(blockRes.error)))

                const blockHeight = parseInt(blockRes.result, 16)
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
    const winnerHash = (winningActivity.hash || '').toLowerCase()
    const winnerAccount = this.activityAccount(winningActivity)
    const winnerChainId = this.activityChainId(winningActivity)
    const winnerNonce = this.activityNonce(winningActivity)

    if (!winnerHash || !winnerAccount || !winnerChainId || !winnerNonce) return

    const activity = (this.store.getState().main.activity || {}) as Record<string, ActivityRecord>
    Object.values(activity).forEach((candidate) => {
      if (!this.isNonTerminalActivity(candidate)) return
      if ((candidate.hash || '').toLowerCase() === winnerHash) return
      if (this.activityAccount(candidate) !== winnerAccount) return
      if (this.activityChainId(candidate) !== winnerChainId) return
      if (this.activityNonce(candidate) !== winnerNonce) return

      this.store.getState().pruneActivity(candidate.id)
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
      this.isActiveProfileAccount(accountId) &&
      this.isNonTerminalActivity(this.store.getState().main.activity[id])
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
    if (!this.isNonTerminalActivity(activity)) return

    const accountId = this.activityAccount(activity)
    if (!accountId || !this.isActiveProfileAccount(accountId)) return

    const token = Symbol(activity.id)
    let inFlight = false

    const monitor = async () => {
      if (inFlight || !this.isCurrentActivityMonitor(activity.id, token, accountId)) return

      const currentActivity = ((this.store.getState().main.activity || {}) as Record<string, ActivityRecord>)[
        activity.id
      ]
      if (!this.isNonTerminalActivity(currentActivity) || !currentActivity.hash) {
        return this.stopActivityMonitor(activity.id)
      }

      const targetChain = this.getActivityChain(currentActivity)
      if (!targetChain) return this.stopActivityMonitor(activity.id)

      inFlight = true
      try {
        const { confirmations, receipt, paused } = await this.getActivityReceiptConfirmations(
          currentActivity,
          targetChain,
          () => this.isCurrentActivityMonitor(activity.id, token, accountId)
        )
        if (paused || !this.isCurrentActivityMonitor(activity.id, token, accountId)) return
        if (!receipt) return

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

        if ((receipt as any)?.status === '0x0') {
          this.finalizeTransactionActivity(txRequest, 'reverted', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
          this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        this.store.getState().updateActivity(activity.id, {
          status: 'confirming',
          confirmations,
          receipt,
          updatedAt: this.dependencies.runtime.now()
        })
      } catch (e) {
        if (this.isCurrentActivityMonitor(activity.id, token, accountId)) {
          log.error('error resuming activity transaction monitor', e)
        }
      } finally {
        inFlight = false
      }
    }

    const timer = setInterval(monitor, 15 * 1000)
    this.activityMonitors[activity.id] = {
      accountId,
      token,
      stop: () => clearInterval(timer)
    }
    void monitor()
  }

  private resumeActivityTracking() {
    const activity = (this.store.getState().main.activity || {}) as Record<string, ActivityRecord>

    Object.values(activity).forEach((record) => {
      this.resumeActivityMonitor(record)
    })
  }

  private openNextActionableRequest(account: FrameAccount) {
    const panelNav = (this.store.getState().windows.panel.nav || []) as any[]
    if (panelNav[0]?.view === 'requestView') return

    const nextRequest = Object.values(account.requests)
      .filter(
        (req) =>
          req.mode !== RequestMode.Monitor &&
          !['confirmed', 'declined', 'error', 'success'].includes(req.status || '')
      )
      .sort((a, b) => (a.created || 0) - (b.created || 0))[0]

    if (!nextRequest) return

    this.store.getState().navForward('panel', {
      view: 'requestView',
      data: {
        step: 'confirm',
        accountId: account.id,
        requestId: nextRequest.handlerId
      }
    })
  }

  async add(address: Address, name = '', options = {}, cb: Callback<FrameAccount> = () => {}) {
    if (!address) return cb(new Error('No address, will not add account'))
    address = address.toLowerCase()

    let account = this.handle(address)
    if (!this.has(address)) {
      log.info(`Account ${address} not found, creating account`)

      const created = 'new:' + this.dependencies.runtime.now()
      const accountMetaId = uuidv5(address, accountNS)
      const accountMeta = this.store.getState().main.accountsMeta[accountMetaId] || { name }
      this.accounts[address] = new FrameAccount(
        { address, name: accountMeta.name, created, options },
        this,
        this.store,
        this.dependencies.chainRpc,
        this.dependencies.simulation,
        this.dependencies.nameResolution,
        this.dependencies.reveal,
        this.dependencies.runtime,
        this.dependencies.requests
      )
      account = this.accounts[address]
    }

    return cb(null, account || undefined)
  }

  rename(id: string, name: string) {
    const account = this.handle(id)
    const nextName = (name || '').trim()
    if (!account || !nextName || account.name === nextName) return

    account.rename(nextName)
    this.dependencies.runtime.schedule(() => this.dependencies.runtime.persistence.flush(), 0)
  }

  current() {
    const currentAccountId = this.store.getState().main.currentAccount
    return currentAccountId ? this.handle(currentAccountId) : null
  }

  private accountForRequest(handlerId: string) {
    return Object.values(this.accounts).find((account) => Boolean(account.requests[handlerId]))
  }

  private defaultAccountAfterRemoving(address: string) {
    const accountOrder = (this.store.getState().main.accountOrder || []) as string[]
    const orderedAccount = accountOrder
      .filter((id) => id !== address)
      .map((id) => this.handle(id))
      .find(Boolean)

    const fallbackId = Object.keys(this.storeApi.getAccounts()).find((id) => id !== address)
    return orderedAccount || (fallbackId ? this.handle(fallbackId) : null)
  }

  startDataScanner() {
    if (!this.dataScanner) {
      this.dataScanner = this.dependencies.createDataScanner(this.store)
      this.pendingPositionRefreshes.forEach((req) => this.refreshTransactionPositions(req))
    }
  }

  refreshBalances(address?: Address) {
    const currentAddress = this.current()?.address
    const targetAddress = address || currentAddress

    if (targetAddress) this.dataScanner?.refreshBalances(targetAddress)
  }

  updateNonce(reqId: string, nonce: string) {
    log.info('Update Nonce: ', reqId, nonce)

    const currentAccount = this.current()

    if (currentAccount) {
      return currentAccount.patchRequest<TransactionRequest>(reqId, (request) => {
        request.data.nonce = nonce
      })
    }
  }

  confirmRequestApproval(reqId: string, approvalType: ApprovalType, approvalData: any) {
    log.info('confirmRequestApproval', reqId, approvalType)

    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[reqId]) {
      currentAccount.approveRequest(reqId, approvalType, approvalData)
    }
  }

  // TODO: can we make this typed for the action type?
  updateRequest(reqId: string, data: any, actionId: ActionType) {
    log.verbose('updateRequest', { reqId, actionId, data })

    const currentAccount = this.current()
    const request = currentAccount?.getRequest(reqId)
    if (!currentAccount || !request) return false

    if (request.type === 'transaction') {
      if (!actionId) return false

      return currentAccount.updateRecognizedAction(reqId, actionId, data)
    }

    if (request.type === 'signErc20Permit') {
      const reqData = data as PermitSignatureRequest
      return Boolean(
        currentAccount.patchRequest<PermitSignatureRequest>(reqId, (permitReq) => {
          Object.assign(permitReq, reqData)
        })
      )
    }

    return false
  }

  async replaceTx(id: string, type: ReplacementType, principal: TrustedPrincipal) {
    const currentAccount = this.current()

    return new Promise<void>((resolve, reject) => {
      if (!currentAccount || !currentAccount.requests[id]) return reject(new Error('Could not find request'))
      if (currentAccount.requests[id].type !== 'transaction')
        return reject(new Error('Request is not transaction'))

      const txRequest = this.getTransactionRequest(currentAccount, id)

      const data = JSON.parse(JSON.stringify(txRequest.data))
      const targetChain = { type: 'ethereum', id: parseInt(data.chainId, 16) }
      const { levels } = this.store.getState().main.networksMeta.ethereum[targetChain.id].gas.price

      // Set the gas default to asap
      this.store.getState().setGasDefault(targetChain.type, targetChain.id, 'asap', levels.asap)

      const params =
        type === ReplacementType.Speed
          ? [data]
          : [
              {
                from: currentAccount.getSelectedAddress(),
                to: currentAccount.getSelectedAddress(),
                value: '0x0',
                nonce: data.nonce,
                chainId: addHexPrefix(targetChain.id.toString(16))
              }
            ]

      const _origin = type === ReplacementType.Speed ? currentAccount.requests[id].origin : frameOriginId

      const tx = {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        chainId: addHexPrefix(targetChain.id.toString(16)),
        params,
        _origin
      }

      this.sendRequest(
        tx,
        (res: RPCResponsePayload) => {
          if (res.error) return reject(new Error(res.error.message))
          resolve()
        },
        principal
      )
    })
  }

  private sendRequest(
    {
      method,
      params,
      chainId,
      _origin = frameOriginId
    }: { method: string; params: any[]; chainId: string; _origin?: string },
    cb: RPCRequestCallback,
    principal?: TrustedPrincipal
  ) {
    this.dependencies.chainRpc.send(
      { id: 1, jsonrpc: '2.0', method, params, chainId, _origin },
      cb,
      principal
    )
  }

  private async confirmations(
    account: FrameAccount,
    id: string,
    hash: string,
    targetChain: Chain,
    isCurrentMonitor: () => boolean = () => true
  ) {
    return new Promise<number>((resolve, reject) => {
      // TODO: Route to account even if it's not current
      if (!account) return reject(new Error('Unable to determine target account'))
      if (!targetChain || !targetChain.type || !targetChain.id)
        return reject(new Error('Unable to determine target chain'))
      const targetChainId = addHexPrefix(targetChain.id.toString(16))

      if (!isCurrentMonitor()) return resolve(-1)

      this.sendRequest(
        { method: 'eth_blockNumber', params: [], chainId: targetChainId },
        (res: RPCResponsePayload) => {
          if (!isCurrentMonitor()) return resolve(-1)
          if (res.error) return reject(new Error(JSON.stringify(res.error)))

          this.sendRequest(
            { method: 'eth_getTransactionReceipt', params: [hash], chainId: targetChainId },
            (receiptRes: RPCResponsePayload) => {
              if (!isCurrentMonitor()) return resolve(-1)
              if (receiptRes.error) return reject(receiptRes.error)
              if (!this.has(account.address)) return reject(new Error('account closed'))

              if (receiptRes.result && account.requests[id]) {
                let txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                  request.tx = {
                    ...request.tx,
                    receipt: receiptRes.result,
                    confirmations: request.tx?.confirmations || 0
                  }
                })
                if (!txRequest) return reject(new Error('request closed'))

                this.refreshTransactionPositions(txRequest)

                if (!txRequest.feeAtTime) {
                  const network = targetChain
                  if (network.type === 'ethereum' && network.id === 1) {
                    const currentState = this.store.getState().main
                    const ethPrice = resolveAssetRate(
                      {
                        chainId: 1,
                        address: NATIVE_CURRENCY,
                        nativeTicker: currentState.networksMeta.ethereum[1].nativeCurrency.symbol
                      },
                      currentState.assetRates
                    )?.usdRate

                    if (ethPrice && txRequest.tx && txRequest.tx.receipt && this.has(account.address)) {
                      const { gasUsed } = txRequest.tx.receipt

                      const feeAtTime = (
                        Math.round(
                          weiIntToEthInt(
                            hexToInt(gasUsed) * hexToInt(txRequest.data.gasPrice || '0x0') * res.result.ethusd
                          ) * 100
                        ) / 100
                      ).toFixed(2)
                      txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                        request.feeAtTime = feeAtTime
                      }) as TransactionRequest
                    }
                  } else {
                    txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                      request.feeAtTime = '?'
                    }) as TransactionRequest
                  }
                }

                const blockHeight = parseInt(res.result, 16)
                const receiptBlock = parseInt((txRequest.tx?.receipt as TransactionReceipt).blockNumber, 16)
                const confirmations = blockHeight - receiptBlock

                txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                  request.tx = { ...request.tx, confirmations }
                }) as TransactionRequest

                this.updateTransactionActivity(txRequest, confirmations)

                const receiptStatus = receiptRes.result.status

                if (receiptStatus === '0x0' && txRequest.status === RequestStatus.Verifying) {
                  txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                    request.status = RequestStatus.Error
                    request.notice = 'Reverted'
                    request.completed = this.dependencies.runtime.now()
                  }) as TransactionRequest
                }

                if (receiptStatus && txRequest.data?.nonce) {
                  this.pruneSameNonceActivityLosers(
                    this.transactionActivityRecord(account, id, txRequest, hash)
                  )

                  // Drop any other pending txs with same nonce.
                  Object.keys(account.requests).forEach((k) => {
                    if (k === id) return

                    const maybeTxReq = account.requests[k]
                    if (maybeTxReq?.type !== 'transaction') return

                    const txReq = this.getTransactionRequest(account, k)
                    const canStillBePending =
                      !txReq.tx?.receipt &&
                      [RequestStatus.Verifying, RequestStatus.Sent, RequestStatus.Sending].includes(
                        txReq.status as RequestStatus
                      )

                    if (canStillBePending && this.inSameNonceLane(txReq, txRequest)) {
                      this.pruneTransactionActivity(txReq)
                      account.patchRequest<TransactionRequest>(k, (request) => {
                        request.status = RequestStatus.Error
                        request.notice = 'Dropped'
                      })
                      this.dependencies.runtime.schedule(
                        () => this.has(account.address) && this.removeRequest(account, k),
                        8000
                      )
                    }
                  })
                }

                if (receiptStatus === '0x1' && txRequest.status === RequestStatus.Verifying) {
                  txRequest = account.patchRequest<TransactionRequest>(id, (request) => {
                    request.status = RequestStatus.Confirming
                    request.notice = 'Confirming'
                    request.completed = this.dependencies.runtime.now()
                  }) as TransactionRequest
                  const hash = txRequest.tx?.hash || ''
                  const body = `Transaction ${shortHash(hash)} successful! \n Click for details`

                  // If Newframe is hidden, trigger native notification
                  this.dependencies.runtime.notify('Transaction Successful', body, () => {
                    this.dependencies.runtime.openBlockExplorer(targetChain, hash)
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
    return this.requestActivityMonitors[id]?.token === token && this.isActiveProfileAccount(accountId)
  }

  private canApplyRequestMonitorResult(id: string, confirmations: number, isCurrent: () => boolean) {
    if (confirmations < 0) return false
    if (isCurrent()) return true

    const status = this.store.getState().main.activity[id]?.status
    return status === 'succeeded' || status === 'reverted'
  }

  private async txMonitor(account: FrameAccount, requestId: string, hash: string) {
    if (!account) return log.error('txMonitor had no target account')

    const activityId = transactionActivityId(hash)
    const accountId = account.address.toLowerCase()
    if (!this.isActiveProfileAccount(accountId) || this.requestActivityMonitors[activityId]) return

    const token = Symbol(activityId)
    this.requestActivityMonitors[activityId] = { accountId, token, stop: () => {} }
    const isCurrentMonitor = () => this.isCurrentRequestActivityMonitor(activityId, token, accountId)
    const installStop = (stop: () => void) => {
      const current = this.requestActivityMonitors[activityId]
      if (current?.token === token) current.stop = stop
      else stop()
    }

    const rawTx = this.getTransactionRequest(account, requestId).data
    account.patchRequest<TransactionRequest>(requestId, (request) => {
      request.tx = { hash, confirmations: 0 }
    })

    const isChainAvailable = (status: string) => !['disconnected', 'degraded'].includes(status.toLowerCase())

    const setTxSent = () => {
      account.patchRequest<TransactionRequest>(requestId, (request) => {
        request.status = RequestStatus.Sent
        request.notice = 'Sent'
        if (request.tx) request.tx.confirmations = 0
      })
    }

    if (!rawTx.chainId) {
      log.error('txMonitor had no target chain')
      this.dependencies.runtime.schedule(
        () => this.has(account.address) && this.removeRequest(account, requestId),
        8 * 1000
      )
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
              if (!isCurrentMonitor() || !this.has(account.address)) {
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
                if (!this.canApplyRequestMonitorResult(activityId, confirmations, isCurrentMonitor)) return
                let txRequest = this.getTransactionRequest(account, requestId)

                if (this.receiptWasReverted(txRequest)) {
                  this.dependencies.runtime.schedule(
                    () => this.has(account.address) && this.removeRequest(account, requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  this.stopRequestActivityMonitor(activityId)
                  return
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest = account.patchRequest<TransactionRequest>(requestId, (request) => {
                    request.status = RequestStatus.Confirmed
                    request.notice = 'Confirmed'
                  }) as TransactionRequest
                  this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })
                  this.dependencies.runtime.schedule(
                    () => this.has(account.address) && this.removeRequest(account, requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  this.stopRequestActivityMonitor(activityId)
                }
              } catch (e) {
                if (!isCurrentMonitor()) return
                log.error('error awaiting confirmations', e)
                this.stopRequestActivityMonitor(activityId)
                setTxSent()
                this.dependencies.runtime.schedule(
                  () => this.has(account.address) && this.removeRequest(account, requestId),
                  60 * 1000
                )
                return
              }
            }

            this.dependencies.runtime.schedule(() => monitor(), 1000)
            const monitorTimer = setInterval(monitor, 1000)

            const statusHandler = (status: string) => {
              if (!isChainAvailable(status)) {
                setTxSent()
                this.stopRequestActivityMonitor(activityId)
              }
            }

            const { type, id } = targetChain

            this.dependencies.chainRpc.on(`status:${type}:${id}`, statusHandler)

            const clear = () => {
              clearInterval(monitorTimer)
              this.dependencies.chainRpc.off(`status:${type}:${id}`, statusHandler)
            }
            installStop(clear)
          } else if (newHeadRes.result) {
            const headSub = newHeadRes.result
            let stopped = false

            const removeSubscription = async (requestRemoveTimeout: number) => {
              this.dependencies.runtime.schedule(
                () => this.has(account.address) && this.removeRequest(account, requestId),
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

            const handler = async (payload: RPCRequestPayload) => {
              if (!isCurrentMonitor()) return
              if (payload.method === 'eth_subscription' && (payload.params as any).subscription === headSub) {
                // const newHead = payload.params.result
                let confirmations
                try {
                  confirmations = await this.confirmations(
                    account,
                    requestId,
                    hash,
                    targetChain,
                    isCurrentMonitor
                  )
                  if (!this.canApplyRequestMonitorResult(activityId, confirmations, isCurrentMonitor)) return
                } catch (e) {
                  if (!isCurrentMonitor()) return
                  log.error(e)

                  setTxSent()
                  return removeSubscription(60 * 1000)
                }

                let txRequest = this.getTransactionRequest(account, requestId)

                if (this.receiptWasReverted(txRequest)) {
                  return removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest = account.patchRequest<TransactionRequest>(requestId, (request) => {
                    request.status = RequestStatus.Confirmed
                    request.notice = 'Confirmed'
                  }) as TransactionRequest
                  this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })

                  removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }
              }
            }

            const { type, id } = targetChain

            this.dependencies.chainRpc.on(`status:${type}:${id}`, statusHandler)
            this.dependencies.chainRpc.on(`data:${type}:${id}`, handler)
            installStop(() => {
              if (stopped) return
              stopped = true
              this.dependencies.chainRpc.off(`data:${targetChain.type}:${targetChain.id}`, handler)
              this.dependencies.chainRpc.off(`status:${targetChain.type}:${targetChain.id}`, statusHandler)
              this.sendRequest(
                { method: 'eth_unsubscribe', chainId: targetChainId, params: [headSub] },
                (res: RPCResponsePayload) => {
                  if (res.error) log.error('error sending message eth_unsubscribe', res)
                }
              )
            })
          }
        }
      )
    }
  }

  // Set Current Account
  setSigner(id: string, cb: Callback<Account>) {
    if (!id) {
      this.store.getState().unsetAccount()
      return cb(null, { id: '', status: '' } as unknown as Account)
    }

    const currentAccount = this.handle(id)

    if (!currentAccount) {
      const err = new Error('could not set signer')
      log.error(`no current account with id: ${id}`, err.stack)

      return cb(err)
    }

    const account = this.get(id) as Account
    this.store.getState().setAccount({ id })
    cb(null, account)

    if (currentAccount.status === 'ok')
      this.verifyAddress(false, (err, verified) => {
        if (!err && !verified) {
          currentAccount.patch({ signer: '' })
        }
      })

    // If the account has any current requests, make sure fees are current
    this.updatePendingFees()
  }

  updatePendingFees(chainId?: number) {
    const currentAccount = this.current()

    if (currentAccount) {
      // If chainId, update pending tx requests from that chain, otherwise update all pending tx requests
      const { l1Transactions, l2Transactions } = toTransactionsByLayer(currentAccount.requests, chainId)

      l1Transactions.forEach(([id, req]) => {
        try {
          const tx = req.data
          const chain = { type: 'ethereum', id: parseInt(tx.chainId, 16) }
          const gas = this.store.getState().main.networksMeta.ethereum[chain.id].gas

          if (usesBaseFee(tx)) {
            const { maxBaseFeePerGas, maxPriorityFeePerGas } = gas.price.fees || {}
            if (!maxBaseFeePerGas || !maxPriorityFeePerGas) throw new Error('Gas fee data unavailable')
            this.setPriorityFee(maxPriorityFeePerGas, id, false)
            this.setBaseFee(maxBaseFeePerGas, id, false)
          } else {
            const gasPrice = gas.price.levels.fast
            if (!gasPrice) throw new Error('Gas price data unavailable')
            this.setGasPrice(gasPrice, id, false)
          }
        } catch (e) {
          log.error('Could not update gas fees for transaction', e)
        }
      })

      if (chainId === 1) {
        l2Transactions.forEach(async ([id, req]) => {
          let estimate = ''
          try {
            estimate = addHexPrefix((await this.dependencies.chainRpc.getL1GasCost(req.data)).toString(16))
          } catch (e) {
            log.error('Error estimating L1 gas cost', e)
          }

          currentAccount.patchRequest<TransactionRequest>(id, (request) => {
            request.chainData = {
              ...request.chainData,
              optimism: { l1Fees: estimate }
            }
          })
        })
      }
    }
  }

  unsetSigner(cb: Callback<{ id: string; status: string }>) {
    const summary = { id: '', status: '' }
    if (cb) cb(null, summary)

    this.store.getState().unsetAccount()

    // this.dependencies.runtime.schedule(() => { // Clear signer requests when unset
    //   if (s) {
    //     s.requests = {}
    //     s.update()
    //   }
    // })
  }

  verifyAddress(display: boolean, cb: Callback<boolean>) {
    const currentAccount = this.current()
    if (currentAccount && currentAccount.verifyAddress) currentAccount.verifyAddress(display, cb)
  }

  getSelectedAddresses() {
    const currentAccount = this.current()
    return currentAccount ? currentAccount.getSelectedAddresses() : []
  }

  getAccounts(cb?: Callback<Array<string>>) {
    const currentAccount = this.current()
    if (!currentAccount) {
      if (cb) cb(new Error('No Account Selected'))
      return
    }

    return currentAccount.getAccounts(cb)
  }

  getCoinbase(cb: Callback<Array<string>>) {
    const currentAccount = this.current()

    if (!currentAccount) return cb(new Error('No Account Selected'))

    currentAccount.getCoinbase(cb)
  }

  signMessage(address: Address, message: string, cb: Callback<string>) {
    const currentAccount = this.current()

    if (!currentAccount) return cb(new Error('No Account Selected'))
    if (address.toLowerCase() !== currentAccount.getSelectedAddress().toLowerCase())
      return cb(new Error('signMessage: Wrong Account Selected'))

    currentAccount.signMessage(message, cb)
  }

  signTypedData(address: Address, typedMessage: TypedMessage, cb: Callback<string>) {
    const currentAccount = this.current()

    if (!currentAccount) return cb(new Error('No Account Selected'))
    if (address.toLowerCase() !== currentAccount.getSelectedAddress().toLowerCase())
      return cb(new Error('signMessage: Wrong Account Selected'))

    currentAccount.signTypedData(typedMessage, cb)
  }

  signTransaction(rawTx: TransactionData, cb: Callback<string>) {
    const currentAccount = this.current()

    if (!currentAccount) return cb(new Error('No Account Selected'))

    const matchSelected =
      (rawTx.from || '').toLowerCase() === currentAccount.getSelectedAddress().toLowerCase()

    if (matchSelected) {
      currentAccount.signTransaction(rawTx, cb)
    } else {
      cb(new Error('signMessage: Account does not match currently selected'))
    }
  }

  close() {
    this.profileObserver?.()
    this.profileObserver = undefined
    Object.values(this.accounts).forEach((account) => account.close())
    this.accounts = {}
    this.dataScanner?.close()
    this.dataScanner = undefined
    this.pendingPositionRefreshes.clear()
    this.transactionPositionTokensByHash.clear()
    Object.keys(this.activityMonitors).forEach((id) => this.stopActivityMonitor(id))
    Object.keys(this.requestActivityMonitors).forEach((id) => this.stopRequestActivityMonitor(id))
    this.activeProfileAccountIds.clear()
    this.initialized = false
    // usbDetect.stopMonitoring()
  }

  dispose() {
    this.close()
    this.removeAllListeners()
  }

  setAccess(req: AccessRequest, access: boolean) {
    const currentAccount = this.current()
    if (currentAccount) {
      currentAccount.setAccess(req, access)
    }
  }

  resolveRequest<T>(req: AccountRequest, result?: T) {
    const currentAccount = this.current()
    if (currentAccount && currentAccount.resolveRequest) {
      currentAccount.resolveRequest(req, result)
    }
  }

  rejectRequest(req: AccountRequest, error: EVMError) {
    const currentAccount = this.current()
    if (currentAccount) {
      currentAccount.rejectRequest(req, error)
    }
  }

  routeRequest(
    principal: TrustedPrincipal,
    req: AccountRequest,
    executeAutonomously?: (request: AccountRequest) => void
  ) {
    this.dependencies.requests.bind(req)
    const decision = decideWalletAction(principal, req)

    if (decision.outcome === 'reject') {
      log.warn('Rejected wallet action', {
        type: req.type,
        account: req.account,
        reason: decision.reason
      })
      this.dependencies.requests.respond(req.handlerId, {
        id: req.payload.id,
        jsonrpc: req.payload.jsonrpc,
        error: { code: 4100, message: decision.reason }
      })
      return false
    }

    if (decision.outcome === 'autonomous') {
      if (!executeAutonomously) {
        log.error('Autonomous wallet action has no executor', {
          actionId: decision.authorization.actionId
        })
        this.dependencies.requests.respond(req.handlerId, {
          id: req.payload.id,
          jsonrpc: req.payload.jsonrpc,
          error: { code: 4100, message: 'Autonomous signing is not enabled for this action' }
        })
        return false
      }

      req.authorization = decision.authorization
      executeAutonomously(req)
      return true
    }

    req.authorization = decision.authorization
    log.info('routeRequest', JSON.stringify(req))

    const requestAccount = this.getFrameAccount(req.account)
    if (requestAccount && !requestAccount.requests[req.handlerId]) {
      requestAccount.addRequest(req)
      return true
    }
    this.dependencies.requests.respond(req.handlerId, {
      id: req.payload.id,
      jsonrpc: req.payload.jsonrpc,
      error: { code: 4100, message: 'Request account is unavailable' }
    })
    return false
  }

  trackAutonomousTransaction(accountId: string, request: TransactionRequest, hash: string) {
    const account = this.getFrameAccount(accountId)
    if (!account) return false

    this.recordSubmittedTransaction(account, request.handlerId, request, hash)
    const activity = this.store.getState().main.activity[transactionActivityId(hash)] as
      | ActivityRecord
      | undefined
    if (activity) this.resumeActivityMonitor(activity)
    return true
  }

  removeRequests(handlerId: string) {
    Object.keys(this.storeApi.getAccounts()).forEach((id) => {
      const account = this.handle(id)
      if (account?.requests[handlerId]) {
        this.removeRequest(account, handlerId)
      }
    })
  }

  removeRequest(account: FrameAccount, handlerId: string) {
    log.info(`removeRequest(${account.id}, ${handlerId})`)

    account.clearRequest(handlerId)
  }

  setRequestPending(req: AccountRequest) {
    const handlerId = req.handlerId
    const requestAccount = this.accountForRequest(handlerId)

    log.info('setRequestPending', handlerId)

    if (requestAccount) {
      const signerType = requestAccount.lastSignerType
      const hwSigner = signerType !== 'seed' && signerType !== 'ring'
      requestAccount.patchRequest(handlerId, (request) => {
        request.status = RequestStatus.Pending
        request.notice = hwSigner ? 'See Signer' : ''
      })
    }
  }

  setRequestError(handlerId: string, err: Error) {
    log.info('setRequestError', handlerId)

    const requestAccount = this.accountForRequest(handlerId)

    if (requestAccount) {
      const errorMessage = (err.message || '').toLowerCase()
      let notice: string

      if (errorMessage === 'ledger device: invalid data received (0x6a80)') {
        notice = 'Ledger Contract Data = No'
      } else if (
        err.message === 'ledger device: condition of use not satisfied (denied by the user?) (0x6985)'
      ) {
        notice = 'Ledger Signature Declined'
      } else if (errorMessage.includes('insufficient funds')) {
        notice = errorMessage.includes('for gas') ? 'insufficient funds for gas' : 'insufficient funds'
      } else {
        notice =
          err && typeof err === 'string'
            ? err
            : err && typeof err === 'object' && err.message && typeof err.message === 'string'
              ? err.message
              : 'Unknown Error' // TODO: Update to normalize input type
      }

      requestAccount.patchRequest(handlerId, (request) => {
        request.status = RequestStatus.Error
        request.notice = notice
      })

      if (requestAccount.requests[handlerId].type === 'transaction') {
        this.dependencies.runtime.schedule(() => {
          if (requestAccount.requests[handlerId]) {
            requestAccount.patchRequest(handlerId, (request) => {
              request.mode = RequestMode.Monitor
            })

            this.dependencies.runtime.schedule(
              () => this.has(requestAccount.address) && this.removeRequest(requestAccount, handlerId),
              8000
            )
          }
        }, 1500)
      } else {
        this.dependencies.runtime.schedule(
          () => this.has(requestAccount.address) && this.removeRequest(requestAccount, handlerId),
          3300
        )
      }
    }
  }

  setTxSigned(handlerId: string, cb: Callback<void>) {
    log.info('setTxSigned', handlerId)

    const requestAccount = this.accountForRequest(handlerId)
    if (!requestAccount) return cb(new Error('No valid request for ' + handlerId))

    if (requestAccount.requests[handlerId]) {
      if (
        requestAccount.requests[handlerId].status === RequestStatus.Declined ||
        requestAccount.requests[handlerId].status === RequestStatus.Error
      ) {
        cb(new Error('Request already declined'))
      } else {
        requestAccount.patchRequest(handlerId, (request) => {
          request.status = RequestStatus.Sending
          request.notice = 'Sending'
        })
        cb(null)
      }
    } else {
      cb(new Error('No valid request for ' + handlerId))
    }
  }

  setTxSent(handlerId: string, hash: string) {
    log.info('setTxSent', handlerId, 'Hash', hash)

    const requestAccount = this.accountForRequest(handlerId)
    if (requestAccount) {
      const txRequest = requestAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
        request.status = RequestStatus.Verifying
        request.notice = 'Verifying'
        request.mode = RequestMode.Monitor
      }) as TransactionRequest

      this.recordSubmittedTransaction(requestAccount, handlerId, txRequest, hash)
      this.store.getState().navClearReq(handlerId, false)
      this.openNextActionableRequest(requestAccount)
      this.txMonitor(requestAccount, handlerId, hash)
    }
  }

  setRequestSuccess(handlerId: string) {
    log.info('setRequestSuccess', handlerId)

    const requestAccount = this.accountForRequest(handlerId)
    if (requestAccount) {
      const isTransaction = requestAccount.requests[handlerId].type === 'transaction'
      if (!isTransaction) {
        this.removeRequest(requestAccount, handlerId)
        return
      }
      requestAccount.patchRequest(handlerId, (request) => {
        request.status = RequestStatus.Success
        request.notice = 'Successful'
        request.mode = RequestMode.Monitor
      })
    }
  }

  clearRequestsByOrigin(address: string, origin: string) {
    if (address && origin) {
      const account = this.handle(address)
      if (account) account.clearRequestsByOrigin(origin)
    }
  }

  private stopNetworkMonitorsForAccount(address: string) {
    const normalizedAddress = address.toLowerCase()
    Object.entries(this.activityMonitors).forEach(([id, monitor]) => {
      if (monitor.accountId === normalizedAddress) this.stopActivityMonitor(id)
    })
    Object.entries(this.requestActivityMonitors).forEach(([id, monitor]) => {
      if (monitor.accountId === normalizedAddress) this.stopRequestActivityMonitor(id)
    })
  }

  remove(address = '') {
    address = address.toLowerCase()
    this.stopNetworkMonitorsForAccount(address)

    const currentAccount = this.current()
    const selectedAccountId = (this.store.getState().main.currentAccount || '').toLowerCase().trim()
    const removingCurrentAccount = currentAccount?.address === address || selectedAccountId === address

    if (removingCurrentAccount) {
      const defaultAccount = this.defaultAccountAfterRemoving(address)

      if (defaultAccount) {
        this.store.getState().setAccount({ id: defaultAccount.id })
      } else {
        this.store.getState().unsetAccount()
      }
    }

    const handle = this.accounts[address]
    if (handle) {
      Object.values(handle.requests).forEach((request) => {
        handle.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
      })
      handle.close()
    }

    this.store.getState().removeAccount(address)
    delete this.accounts[address]
  }

  private invalidValue(fee: string) {
    return !fee || isNaN(parseInt(fee, 16)) || parseInt(fee, 16) < 0
  }

  private limitedHexValue(hexValue: string, min: number, max: number) {
    const value = parseInt(hexValue, 16)
    if (value < min) return intToHex(min)
    if (value > max) return intToHex(max)
    return hexValue
  }

  private txFeeUpdate(inputValue: string, handlerId: string, userUpdate: boolean) {
    // Check value
    if (this.invalidValue(inputValue)) throw new Error('txFeeUpdate, invalid input value')

    // Get current account
    const currentAccount = this.current()
    if (!currentAccount) throw new Error('No account selected while setting base fee')

    const request = this.getTransactionRequest(currentAccount, handlerId)
    if (!request || request.type !== 'transaction')
      throw new Error(`Could not find transaction request with handlerId ${handlerId}`)
    if (request.locked) throw new Error('Request has already been approved by the user')
    if (request.feesUpdatedByUser && !userUpdate) throw new Error('Fee has been updated by user')

    const tx = request.data
    const gasLimit = parseInt(tx.gasLimit || '0x0', 16)
    const txType = tx.type

    if (usesBaseFee(tx)) {
      const maxFeePerGas = parseInt(tx.maxFeePerGas || '0x0', 16)
      const maxPriorityFeePerGas = parseInt(tx.maxPriorityFeePerGas || '0x0', 16)
      const currentBaseFee = maxFeePerGas - maxPriorityFeePerGas
      return {
        currentAccount,
        inputValue,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        currentBaseFee,
        txType,
        gasPrice: 0
      }
    } else {
      const gasPrice = parseInt(tx.gasPrice || '0x0', 16)
      return {
        currentAccount,
        inputValue,
        gasPrice,
        gasLimit,
        txType,
        currentBaseFee: 0,
        maxPriorityFeePerGas: 0,
        maxFeePerGas: 0
      }
    }
  }

  private completeTxFeeUpdate(
    currentAccount: FrameAccount,
    handlerId: string,
    userUpdate: boolean,
    previousFee: any,
    data: TransactionData
  ) {
    currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
      request.data = data
      if (userUpdate) {
        request.feesUpdatedByUser = true
        delete request.automaticFeeUpdateNotice
      } else if (!request.automaticFeeUpdateNotice && previousFee) {
        request.automaticFeeUpdateNotice = { previousFee }
      }
    })
  }

  setBaseFee(baseFee: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, maxPriorityFeePerGas, gasLimit, currentBaseFee, txType } = this.txFeeUpdate(
      baseFee,
      handlerId,
      userUpdate
    )

    // New value
    const newBaseFee = parseInt(this.limitedHexValue(baseFee, 0, 9999 * 1e9), 16)

    // No change
    if (newBaseFee === currentBaseFee) return

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const tx = { ...txRequest.data }

    // New max fee per gas
    const newMaxFeePerGas = newBaseFee + maxPriorityFeePerGas
    const maxTotalFee = this.dependencies.transactionPolicy.maxFee(tx)

    // Limit max fee
    if (newMaxFeePerGas * gasLimit > maxTotalFee) {
      tx.maxFeePerGas = intToHex(Math.floor(maxTotalFee / gasLimit))
    } else {
      tx.maxFeePerGas = intToHex(newMaxFeePerGas)
    }

    // Complete update
    const previousFee = {
      type: txType,
      baseFee: intToHex(currentBaseFee),
      priorityFee: intToHex(maxPriorityFeePerGas)
    }

    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee, tx)
  }

  setPriorityFee(priorityFee: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, maxPriorityFeePerGas, gasLimit, currentBaseFee, txType } = this.txFeeUpdate(
      priorityFee,
      handlerId,
      userUpdate
    )

    // New values
    const newMaxPriorityFeePerGas = parseInt(this.limitedHexValue(priorityFee, 0, 9999 * 1e9), 16)

    // No change
    if (newMaxPriorityFeePerGas === maxPriorityFeePerGas) return

    const tx = { ...this.getTransactionRequest(currentAccount, handlerId).data }

    // New max fee per gas
    const newMaxFeePerGas = currentBaseFee + newMaxPriorityFeePerGas
    const maxTotalFee = this.dependencies.transactionPolicy.maxFee(tx)

    // Limit max fee
    if (newMaxFeePerGas * gasLimit > maxTotalFee) {
      const limitedMaxFeePerGas = Math.floor(maxTotalFee / gasLimit)
      const limitedMaxPriorityFeePerGas = limitedMaxFeePerGas - currentBaseFee
      tx.maxPriorityFeePerGas = intToHex(limitedMaxPriorityFeePerGas)
      tx.maxFeePerGas = intToHex(limitedMaxFeePerGas)
    } else {
      tx.maxFeePerGas = intToHex(newMaxFeePerGas)
      tx.maxPriorityFeePerGas = intToHex(newMaxPriorityFeePerGas)
    }

    const previousFee = {
      type: txType,
      baseFee: intToHex(currentBaseFee),
      priorityFee: intToHex(maxPriorityFeePerGas)
    }

    // Complete update
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee, tx)
  }

  setGasPrice(price: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, gasLimit, gasPrice, txType } = this.txFeeUpdate(price, handlerId, userUpdate)

    // New values
    const newGasPrice = parseInt(this.limitedHexValue(price, 0, 9999 * 1e9), 16)

    // No change
    if (newGasPrice === gasPrice) return

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const tx = { ...txRequest.data }
    const maxTotalFee = this.dependencies.transactionPolicy.maxFee(tx)

    // Limit max fee
    if (newGasPrice * gasLimit > maxTotalFee) {
      tx.gasPrice = intToHex(Math.floor(maxTotalFee / gasLimit))
    } else {
      tx.gasPrice = intToHex(newGasPrice)
    }

    const previousFee = {
      type: txType,
      gasPrice: intToHex(gasPrice)
    }

    // Complete update
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee, tx)
  }

  setGasLimit(limit: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, maxFeePerGas, gasPrice, txType } = this.txFeeUpdate(limit, handlerId, userUpdate)

    // New values
    const newGasLimit = parseInt(this.limitedHexValue(limit, 0, 12.5e6), 16)

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const tx = { ...txRequest.data }
    const maxTotalFee = this.dependencies.transactionPolicy.maxFee(tx)

    const fee = txType === '0x2' ? maxFeePerGas : gasPrice
    if (newGasLimit * fee > maxTotalFee) {
      tx.gasLimit = intToHex(Math.floor(maxTotalFee / fee))
    } else {
      tx.gasLimit = intToHex(newGasLimit)
    }

    // Complete update
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, false, tx)
  }

  removeFeeUpdateNotice(handlerId: string, cb: Callback<void>) {
    const currentAccount = this.current()
    if (!currentAccount) return cb(new Error('No account selected while removing fee notice'))

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    if (!txRequest) return cb(new Error(`Could not find request ${handlerId}`))

    currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
      delete request.automaticFeeUpdateNotice
    })

    cb(null)
  }

  adjustNonce(handlerId: string, nonceAdjust: number) {
    const currentAccount = this.current()

    if (nonceAdjust !== 1 && nonceAdjust !== -1) return log.error('Invalid nonce adjustment', nonceAdjust)
    if (!currentAccount) return log.error('No account selected during nonce adjustement', nonceAdjust)

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)

    if (txRequest && txRequest.type === 'transaction') {
      const nonce = txRequest.data && txRequest.data.nonce
      if (nonce) {
        let updatedNonce = parseInt(nonce, 16) + nonceAdjust
        if (updatedNonce < 0) updatedNonce = 0
        const adjustedNonce = intToHex(updatedNonce)

        currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
          request.data.nonce = adjustedNonce
        })
      } else {
        const { from, chainId } = txRequest.data
        this.sendRequest(
          { method: 'eth_getTransactionCount', chainId, params: [from, 'pending'] },
          (res: RPCResponsePayload) => {
            if (res.result) {
              const newNonce = parseInt(res.result, 16)
              let updatedNonce = nonceAdjust === 1 ? newNonce : newNonce + nonceAdjust
              if (updatedNonce < 0) updatedNonce = 0
              const adjustedNonce = intToHex(updatedNonce)
              currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
                request.data.nonce = adjustedNonce
              })
            }
          }
        )
      }
    }
  }

  resetNonce(handlerId: string) {
    const currentAccount = this.current()
    if (!currentAccount) return log.error('No account selected during nonce reset')

    currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
      const initialNonce = request.payload.params[0].nonce
      if (initialNonce) {
        request.data.nonce = initialNonce
      } else {
        delete request.data.nonce
      }
    })
  }

  lockRequest(handlerId: string) {
    // When a request is approved, lock it so that no automatic updates such as fee changes can happen
    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[handlerId]) {
      currentAccount.patchRequest<TransactionRequest>(handlerId, (request) => {
        request.locked = true
      })
    } else {
      log.error('Trying to lock request ' + handlerId + ' but there is no current account')
    }
  }

  // removeAllAccounts () {
  //   this.dependencies.runtime.schedule(() => {
  //     Object.keys(this.accounts).forEach(id => {
  //       if (this.accounts[id]) this.accounts[id].close()
  //       this.store.getState().removeAccount(id)
  //       delete this.accounts[id]
  //     })
  //   }, 1000)
  // }
}
