import EventEmitter from 'events'
import log from 'electron-log'
import { Notification } from 'electron'
import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { v5 as uuidv5 } from 'uuid'

import provider from '../provider'
import store from '../store'
import persist from '../store/persist'
import FrameAccount from './Account'
import ExternalDataScanner, { DataScanner } from '../externalData'
import Signer from '../signers/Signer'
import { signerCompatibility as transactionCompatibility, maxFee, SignerCompatibility } from '../transaction'

import { weiIntToEthInt, hexToInt } from '../../resources/utils'
import { accountPanelCrumb, signerPanelCrumb } from '../../resources/domain/nav'
import {
  usesBaseFee,
  TransactionData,
  GasFeesSource,
  TRANSACTION_CONFIRMATION_TARGET,
  getTransactionIntent
} from '../../resources/domain/transaction'
import { findUnavailableSigners, isSignerReady } from '../../resources/domain/signer'

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
} from './types'

import type { Chain } from '../chains'
import { ActionType } from '../transaction/actions'
import { openBlockExplorer } from '../windows/window'
import { ApprovalType } from '../../resources/constants'
import { accountNS } from '../../resources/domain/account'
import { chainUsesOptimismFees } from '../../resources/utils/chains'
import type { ActivityRecord } from '../store/state'

function notify(title: string, body: string, action: (event: Electron.Event) => void) {
  const notification = new Notification({ title, body })
  notification.on('click', action)

  setTimeout(() => notification.show(), 1000)
}

function shortHash(hash?: string) {
  if (!hash) return ''
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`
}

function cloneForActivity(value: any) {
  if (value === undefined) return undefined

  try {
    return JSON.parse(JSON.stringify(value, (_key, nextValue) => {
      if (typeof nextValue === 'function') return undefined
      return nextValue
    }))
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

const storeApi = {
  getAccounts: function () {
    return (store('main.accounts') || {}) as Record<string, Account>
  },
  getAccount: function (id: string) {
    return (store('main.accounts', id) || {}) as Account
  },
  getSigners: function () {
    return Object.values((store('main.signers') || {}) as Record<string, Signer>)
  }
}

export { RequestMode } from './types'
export type {
  AccountRequest,
  AccessRequest,
  TransactionRequest,
  SignTypedDataRequest,
  AddChainRequest,
  AddTokenRequest
} from './types'

type RequestWithId = [string, TransactionRequest]

export class Accounts extends EventEmitter {
  _current: string
  accounts: Record<string, FrameAccount>

  private dataScanner?: DataScanner
  private activityMonitors: Record<string, () => void> = {}

  constructor() {
    super()

    this.accounts = Object.entries(storeApi.getAccounts()).reduce(
      (accounts, [id, account]) => {
        accounts[id] = new FrameAccount(JSON.parse(JSON.stringify(account)), this)

        return accounts
      },
      {} as Record<string, FrameAccount>
    )

    const persistedCurrent = store('main.currentAccount') as string
    this._current =
      (persistedCurrent && this.accounts[persistedCurrent]?.id) ||
      Object.values(this.accounts).find((acct) => acct.active)?.id ||
      ''

    this.resumeActivityTracking()
  }

  get(id: string) {
    return this.accounts[id] && this.accounts[id].summary()
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
    const chainSymbol =
      (chain ? store('main.networks.ethereum', chain.id, 'symbol') : '') ||
      (chain ? store('main.networksMeta.ethereum', chain.id, 'nativeCurrency.symbol') : '') ||
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
      submittedAt: Date.now(),
      updatedAt: Date.now(),
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
    const chainName = chain ? store('main.networks.ethereum', chain.id, 'name') : ''
    const now = Date.now()

    store.upsertPendingNotification({
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

  private recordSubmittedTransaction(account: FrameAccount, handlerId: string, req: TransactionRequest, hash: string) {
    store.upsertSubmittedActivity(this.transactionActivityRecord(account, handlerId, req, hash))
    this.upsertTransactionNotification(account, req, hash)
  }

  syncTransactionActivity(account: FrameAccount, req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash) return

    const id = transactionActivityId(hash)
    const activity = store('main.activity', id)
    if (!activity) return

    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))

    store.updateActivity(id, {
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
      updatedAt: Date.now()
    })

    const notificationId = transactionNotificationId(hash)
    const notification = store('view.notifications', notificationId)
    if (!notification) return

    const update = {
      title: display.title,
      detail: shortHash(hash),
      updatedAt: notification.updatedAt,
      expiresAt: notification.expiresAt,
      hidden: notification.hidden
    }

    if (notification.state === 'pending') {
      store.upsertPendingNotification({
        ...notification,
        ...update,
        id: notificationId
      })
    } else {
      store.resolveNotification(notificationId, notification.state, update)
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

    store.updateActivity(transactionActivityId(hash), {
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
      updatedAt: Date.now()
    })
  }

  private finalizeTransactionActivity(
    req: TransactionRequest,
    status: 'succeeded' | 'reverted',
    update: any = {}
  ) {
    const hash = req.tx?.hash
    if (!hash) return

    const now = Date.now()
    const notificationState = status === 'succeeded' ? 'completed' : 'failed'
    const display = this.getTransactionActivityDisplay(req, this.getTransactionChain(req))

    store.finalizeActivity(transactionActivityId(hash), status, {
      ...update,
      display,
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

    store.resolveNotification(transactionNotificationId(hash), notificationState, {
      title: display.title,
      detail: shortHash(hash),
      expiresAt: now + 3000,
      updatedAt: now
    })
  }

  private pruneTransactionActivity(req: TransactionRequest) {
    const hash = req.tx?.hash
    if (!hash) return

    store.pruneActivity(transactionActivityId(hash))
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

  private async getActivityReceiptConfirmations(activity: ActivityRecord, targetChain: Chain) {
    return new Promise<{ confirmations: number; receipt?: TransactionReceipt }>((resolve, reject) => {
      const targetChainId = addHexPrefix(targetChain.id.toString(16))

      this.sendRequest(
        { method: 'eth_getTransactionReceipt', params: [activity.hash], chainId: targetChainId },
        (receiptRes: RPCResponsePayload) => {
          if (receiptRes.error) return reject(receiptRes.error)

          const receipt = receiptRes.result as TransactionReceipt | undefined
          if (!receipt) {
            return resolve({ confirmations: Number(activity.confirmations || 0) })
          }

          this.sendRequest(
            { method: 'eth_blockNumber', params: [], chainId: targetChainId },
            (blockRes: RPCResponsePayload) => {
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
    })
  }

  private pruneSameNonceActivityLosers(winningActivity: ActivityRecord) {
    const winnerHash = (winningActivity.hash || '').toLowerCase()
    const winnerAccount = this.activityAccount(winningActivity)
    const winnerChainId = this.activityChainId(winningActivity)
    const winnerNonce = this.activityNonce(winningActivity)

    if (!winnerHash || !winnerAccount || !winnerChainId || !winnerNonce) return

    const activity = (store('main.activity') || {}) as Record<string, ActivityRecord>
    Object.values(activity).forEach((candidate) => {
      if (!this.isNonTerminalActivity(candidate)) return
      if ((candidate.hash || '').toLowerCase() === winnerHash) return
      if (this.activityAccount(candidate) !== winnerAccount) return
      if (this.activityChainId(candidate) !== winnerChainId) return
      if (this.activityNonce(candidate) !== winnerNonce) return

      store.pruneActivity(candidate.id)
      this.stopActivityMonitor(candidate.id)
    })
  }

  private stopActivityMonitor(id: string) {
    this.activityMonitors[id]?.()
    delete this.activityMonitors[id]
  }

  private resumeActivityMonitor(activity: ActivityRecord) {
    if (!activity.id || this.activityMonitors[activity.id] || !activity.hash) return
    if (!this.isNonTerminalActivity(activity)) return

    const monitor = async () => {
      const currentActivity = ((store('main.activity') || {}) as Record<string, ActivityRecord>)[activity.id]
      if (!this.isNonTerminalActivity(currentActivity) || !currentActivity.hash) {
        return this.stopActivityMonitor(activity.id)
      }

      const targetChain = this.getActivityChain(currentActivity)
      if (!targetChain) return this.stopActivityMonitor(activity.id)

      try {
        const { confirmations, receipt } = await this.getActivityReceiptConfirmations(currentActivity, targetChain)
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

        this.pruneSameNonceActivityLosers(currentActivity)

        if ((receipt as any)?.status === '0x0') {
          this.finalizeTransactionActivity(txRequest, 'reverted', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
          this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations, receipt })
          return this.stopActivityMonitor(activity.id)
        }

        store.updateActivity(activity.id, {
          status: 'confirming',
          confirmations,
          receipt,
          updatedAt: Date.now()
        })
      } catch (e) {
        log.error('error resuming activity transaction monitor', e)
      }
    }

    const timer = setInterval(monitor, 15 * 1000)
    this.activityMonitors[activity.id] = () => clearInterval(timer)
    void monitor()
  }

  private resumeActivityTracking() {
    const activity = (store('main.activity') || {}) as Record<string, ActivityRecord>

    Object.values(activity).forEach((record) => {
      this.resumeActivityMonitor(record)
    })
  }

  private openNextActionableRequest(account: FrameAccount) {
    const panelNav = store('windows.panel.nav') || []
    if (panelNav[0]?.view === 'requestView') return

    const nextRequest = Object.values(account.requests)
      .filter(
        (req) =>
          req.mode !== RequestMode.Monitor &&
          !['confirmed', 'declined', 'error', 'success'].includes(req.status || '')
      )
      .sort((a, b) => (a.created || 0) - (b.created || 0))[0]

    if (!nextRequest) return

    store.navForward('panel', {
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

    let account = store('main.accounts', address)
    if (!account) {
      log.info(`Account ${address} not found, creating account`)

      const created = 'new:' + Date.now()
      const accountMetaId = uuidv5(address, accountNS)
      const accountMeta = store('main.accountsMeta', accountMetaId) || { name }
      this.accounts[address] = new FrameAccount(
        { address, name: accountMeta.name, created, options, active: false },
        this
      )
      account = this.accounts[address]
    }

    return cb(null, account)
  }

  rename(id: string, name: string) {
    const account = this.accounts[id]
    const nextName = (name || '').trim()
    if (!account || !nextName || account.name === nextName) return

    account.rename(nextName)
    setTimeout(() => persist.writeUpdates(), 0)
  }

  update(account: Account) {
    if (!this.accounts || this.accounts[account.id]) {
      store.updateAccount(account)
    }
  }

  current() {
    return this._current ? this.accounts[this._current] : null
  }

  startDataScanner() {
    if (!this.dataScanner) {
      this.dataScanner = ExternalDataScanner()
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
      const txRequest = this.getTransactionRequest(currentAccount, reqId)

      txRequest.data.nonce = nonce
      currentAccount.update()

      return txRequest
    }
  }

  confirmRequestApproval(reqId: string, approvalType: ApprovalType, approvalData: any) {
    log.info('confirmRequestApproval', reqId, approvalType)

    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[reqId]) {
      const txRequest = this.getTransactionRequest(currentAccount, reqId)

      const approval = (txRequest.approvals || []).find((a) => a.type === approvalType)

      if (approval) {
        approval.approve(approvalData)
      }
    }
  }

  // TODO: can we make this typed for the action type?
  updateRequest(reqId: string, data: any, actionId: ActionType) {
    log.verbose('updateRequest', { reqId, actionId, data })

    const currentAccount = this.current()
    const request = currentAccount?.getRequest(reqId)
    if (!currentAccount || !request) return

    if (request.type === 'transaction') {
      if (!actionId) return

      const transactionReq = request as TransactionRequest
      const action = (transactionReq.recognizedActions || []).find((a) => a.id === actionId)
      if (!action?.update) return

      action?.update(transactionReq, data)
    }

    if (request.type === 'signErc20Permit') {
      const permitReq = request as PermitSignatureRequest
      const reqData = data as PermitSignatureRequest

      Object.assign(permitReq, reqData)
    }

    currentAccount.update()
  }

  async replaceTx(id: string, type: ReplacementType) {
    const currentAccount = this.current()

    return new Promise<void>((resolve, reject) => {
      if (!currentAccount || !currentAccount.requests[id]) return reject(new Error('Could not find request'))
      if (currentAccount.requests[id].type !== 'transaction')
        return reject(new Error('Request is not transaction'))

      const txRequest = this.getTransactionRequest(currentAccount, id)

      const data = JSON.parse(JSON.stringify(txRequest.data))
      const targetChain = { type: 'ethereum', id: parseInt(data.chainId, 16) }
      const { levels } = store('main.networksMeta', targetChain.type, targetChain.id, 'gas.price')

      // Set the gas default to asap
      store.setGasDefault(targetChain.type, targetChain.id, 'asap', levels.asap)

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

      this.sendRequest(tx, (res: RPCResponsePayload) => {
        if (res.error) return reject(new Error(res.error.message))
        resolve()
      })
    })
  }

  private sendRequest(
    {
      method,
      params,
      chainId,
      _origin = frameOriginId
    }: { method: string; params: any[]; chainId: string; _origin?: string },
    cb: RPCRequestCallback
  ) {
    provider.send({ id: 1, jsonrpc: '2.0', method, params, chainId, _origin }, cb)
  }

  private async confirmations(account: FrameAccount, id: string, hash: string, targetChain: Chain) {
    return new Promise<number>((resolve, reject) => {
      // TODO: Route to account even if it's not current
      if (!account) return reject(new Error('Unable to determine target account'))
      if (!targetChain || !targetChain.type || !targetChain.id)
        return reject(new Error('Unable to determine target chain'))
      const targetChainId = addHexPrefix(targetChain.id.toString(16))

      this.sendRequest(
        { method: 'eth_blockNumber', params: [], chainId: targetChainId },
        (res: RPCResponsePayload) => {
          if (res.error) return reject(new Error(JSON.stringify(res.error)))

          this.sendRequest(
            { method: 'eth_getTransactionReceipt', params: [hash], chainId: targetChainId },
            (receiptRes: RPCResponsePayload) => {
              if (receiptRes.error) return reject(receiptRes.error)
              if (!this.accounts[account.address]) return reject(new Error('account closed'))

              if (receiptRes.result && account.requests[id]) {
                const txRequest = this.getTransactionRequest(account, id)

                txRequest.tx = {
                  ...txRequest.tx,
                  receipt: receiptRes.result,
                  confirmations: txRequest.tx?.confirmations || 0
                }

                account.update()

                if (!txRequest.feeAtTime) {
                  const network = targetChain
                  if (network.type === 'ethereum' && network.id === 1) {
                    const ethPrice = store('main.networksMeta.ethereum.1.nativeCurrency.usd.price')

                    if (ethPrice && txRequest.tx && txRequest.tx.receipt && this.accounts[account.address]) {
                      const { gasUsed } = txRequest.tx.receipt

                      txRequest.feeAtTime = (
                        Math.round(
                          weiIntToEthInt(
                            hexToInt(gasUsed) * hexToInt(txRequest.data.gasPrice || '0x0') * res.result.ethusd
                          ) * 100
                        ) / 100
                      ).toFixed(2)
                      account.update()
                    }
                  } else {
                    txRequest.feeAtTime = '?'
                    account.update()
                  }
                }

                const blockHeight = parseInt(res.result, 16)
                const receiptBlock = parseInt((txRequest.tx.receipt as TransactionReceipt).blockNumber, 16)
                const confirmations = blockHeight - receiptBlock

                txRequest.tx = {
                  ...txRequest.tx,
                  confirmations
                }

                this.updateTransactionActivity(txRequest, confirmations)

                const receiptStatus = receiptRes.result.status

                if (receiptStatus === '0x0' && txRequest.status === RequestStatus.Verifying) {
                  txRequest.status = RequestStatus.Error
                  txRequest.notice = 'Reverted'
                  txRequest.completed = Date.now()
                  account.update()
                }

                if (receiptStatus && txRequest.data?.nonce) {
                  this.pruneSameNonceActivityLosers(this.transactionActivityRecord(account, id, txRequest, hash))

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
                      txReq.status = RequestStatus.Error
                      txReq.notice = 'Dropped'
                      setTimeout(() => this.accounts[account.address] && this.removeRequest(account, k), 8000)
                    }
                  })
                }

                if (receiptStatus === '0x1' && txRequest.status === RequestStatus.Verifying) {
                  txRequest.status = RequestStatus.Confirming
                  txRequest.notice = 'Confirming'
                  txRequest.completed = Date.now()
                  const hash = txRequest.tx.hash || ''
                  const body = `Transaction ${shortHash(hash)} successful! \n Click for details`

                  // If Newframe is hidden, trigger native notification
                  notify('Transaction Successful', body, () => {
                    openBlockExplorer(targetChain, hash)
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

  private async txMonitor(account: FrameAccount, requestId: string, hash: string) {
    if (!account) return log.error('txMonitor had no target account')

    const txRequest = this.getTransactionRequest(account, requestId)
    const rawTx = txRequest.data
    txRequest.tx = { hash, confirmations: 0 }

    account.update()

    const isChainAvailable = (status: string) => !['disconnected', 'degraded'].includes(status.toLowerCase())

    const setTxSent = () => {
      txRequest.status = RequestStatus.Sent
      txRequest.notice = 'Sent'

      if (txRequest.tx) txRequest.tx.confirmations = 0
      account.update()
    }

    if (!rawTx.chainId) {
      log.error('txMonitor had no target chain')
      setTimeout(() => this.accounts[account.address] && this.removeRequest(account, requestId), 8 * 1000)
    } else {
      const targetChain: Chain = {
        type: 'ethereum',
        id: parseInt(rawTx.chainId, 16)
      }

      const targetChainId = addHexPrefix(targetChain.id.toString(16))
      this.sendRequest(
        { method: 'eth_subscribe', params: ['newHeads'], chainId: targetChainId },
        (newHeadRes: RPCResponsePayload) => {
          if (newHeadRes.error) {
            log.warn(newHeadRes.error)
            const monitor = async () => {
              if (!this.accounts[account.address]) {
                clearTimeout(monitorTimer)
                return log.error('txMonitor internal monitor had no target account')
              }

              let confirmations
              try {
                confirmations = await this.confirmations(account, requestId, hash, targetChain)
                txRequest.tx = { ...txRequest.tx, confirmations }

                account.update()

                if (this.receiptWasReverted(txRequest)) {
                  setTimeout(
                    () => this.accounts[account.address] && this.removeRequest(account, requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  clear()
                  return
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest.status = RequestStatus.Confirmed
                  txRequest.notice = 'Confirmed'
                  this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })
                  account.update()
                  setTimeout(
                    () => this.accounts[account.address] && this.removeRequest(account, requestId),
                    CONFIRMED_REQUEST_CLOSE_MS
                  )
                  clear()
                }
              } catch (e) {
                log.error('error awaiting confirmations', e)
                clear()
                setTxSent()
                setTimeout(
                  () => this.accounts[account.address] && this.removeRequest(account, requestId),
                  60 * 1000
                )
                return
              }
            }

            setTimeout(() => monitor(), 1000)
            const monitorTimer = setInterval(monitor, 1000)

            const statusHandler = (status: string) => {
              if (!isChainAvailable(status)) {
                setTxSent()
                clear()
              }
            }

            const { type, id } = targetChain

            provider.on(`status:${type}:${id}`, statusHandler)

            const clear = () => {
              clearInterval(monitorTimer)
              provider.off(`status:${type}:${id}`, statusHandler)
            }
          } else if (newHeadRes.result) {
            const headSub = newHeadRes.result

            const removeSubscription = async (requestRemoveTimeout: number) => {
              setTimeout(
                () => this.accounts[account.address] && this.removeRequest(account, requestId),
                requestRemoveTimeout
              )
              provider.off(`data:${targetChain.type}:${targetChain.id}`, handler)
              provider.off(`status:${targetChain.type}:${targetChain.id}`, statusHandler)
              this.sendRequest(
                { method: 'eth_unsubscribe', chainId: targetChainId, params: [headSub] },
                (res: RPCResponsePayload) => {
                  if (res.error) {
                    log.error('error sending message eth_unsubscribe', res)
                  }
                }
              )
            }

            const statusHandler = (status: string) => {
              if (!isChainAvailable(status)) {
                setTxSent()
                removeSubscription(60 * 1000)
              }
            }

            const handler = async (payload: RPCRequestPayload) => {
              if (payload.method === 'eth_subscription' && (payload.params as any).subscription === headSub) {
                // const newHead = payload.params.result
                let confirmations
                try {
                  confirmations = await this.confirmations(account, requestId, hash, targetChain)
                } catch (e) {
                  log.error(e)

                  setTxSent()
                  return removeSubscription(60 * 1000)
                }

                txRequest.tx = { ...txRequest.tx, confirmations }
                account.update()

                if (this.receiptWasReverted(txRequest)) {
                  return removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }

                if (confirmations >= TRANSACTION_CONFIRMATION_TARGET) {
                  txRequest.status = RequestStatus.Confirmed
                  txRequest.notice = 'Confirmed'
                  this.finalizeTransactionActivity(txRequest, 'succeeded', { confirmations })
                  account.update()

                  removeSubscription(CONFIRMED_REQUEST_CLOSE_MS)
                }
              }
            }

            const { type, id } = targetChain

            provider.on(`status:${type}:${id}`, statusHandler)
            provider.on(`data:${type}:${id}`, handler)
          }
        }
      )
    }
  }

  // Set Current Account
  setSigner(id: string, cb: Callback<Account>) {
    const previouslyActiveAccount = this.current()

    this._current = id
    const currentAccount = this.current()

    if (!currentAccount) {
      const err = new Error('could not set signer')
      log.error(`no current account with id: ${id}`, err.stack)

      return cb(err)
    }

    currentAccount.active = true
    currentAccount.update()

    const summary = currentAccount.summary()
    cb(null, summary)

    if (previouslyActiveAccount && previouslyActiveAccount.address !== currentAccount.address) {
      previouslyActiveAccount.active = false
      previouslyActiveAccount.update()
    }

    store.setAccount(summary)

    if (currentAccount.status === 'ok')
      this.verifyAddress(false, (err, verified) => {
        if (!err && !verified) {
          currentAccount.signer = ''
          currentAccount.update()
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
          const gas = store('main.networksMeta', chain.type, chain.id, 'gas')

          if (usesBaseFee(tx)) {
            const { maxBaseFeePerGas, maxPriorityFeePerGas } = gas.price.fees
            this.setPriorityFee(maxPriorityFeePerGas, id, false)
            this.setBaseFee(maxBaseFeePerGas, id, false)
          } else {
            const gasPrice = gas.price.levels.fast
            this.setGasPrice(gasPrice, id, false)
          }
        } catch (e) {
          log.error('Could not update gas fees for transaction', e)
        }
      })

      if (chainId === 1) {
        l2Transactions.forEach(async ([_id, req]) => {
          let estimate = ''
          try {
            estimate = addHexPrefix((await provider.getL1GasCost(req.data)).toString(16))
          } catch (e) {
            log.error('Error estimating L1 gas cost', e)
          }

          req.chainData = {
            ...req.chainData,
            optimism: {
              l1Fees: estimate
            }
          }

          currentAccount.update()
        })
      }
    }
  }

  unsetSigner(cb: Callback<{ id: string; status: string }>) {
    const summary = { id: '', status: '' }
    if (cb) cb(null, summary)

    store.unsetAccount()

    // setTimeout(() => { // Clear signer requests when unset
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

  signerCompatibility(handlerId: string, cb: Callback<SignerCompatibility>) {
    const currentAccount = this.current()
    if (!currentAccount) return cb(new Error('Could not locate account'))

    const request = currentAccount.requests[handlerId]
    if (!request) return cb(new Error(`Could not locate request ${handlerId}`))

    const signer = currentAccount.getSigner()

    const signerUnavailable = (knownSigner?: Signer) => {
      const crumb = knownSigner ? signerPanelCrumb(knownSigner) : accountPanelCrumb()

      store.navDash(crumb)
      return cb(new Error('Signer unavailable'))
    }

    if (!signer) {
      // if no signer is active, check if this account was previously relying on a
      // hardware signer that is currently disconnected
      const unavailableSigners = findUnavailableSigners(currentAccount.lastSignerType, storeApi.getSigners())

      // if there is only one matching disconnected signer, open the signer panel so it can be unlocked
      if (unavailableSigners.length === 1) return signerUnavailable(unavailableSigners[0])

      // if there is more than one matching signer, open the account panel so the user can choose
      if (unavailableSigners.length > 1) return signerUnavailable()

      // otherwise there are no signers that can be found
      return cb(new Error('No signer'))
    }

    if (!isSignerReady(signer)) {
      // if the signer is not ready to sign, open the signer panel so that
      // the user can unlock it or reconnect
      return signerUnavailable(signer)
    }

    const getCompatibility = () => {
      if (request.type === 'transaction') {
        const data = this.getTransactionRequest(currentAccount, handlerId).data
        return transactionCompatibility(data, signer.summary())
      }

      // all requests besides transactions are always compatible
      return { signer: signer.type, tx: '', compatible: true }
    }

    cb(null, getCompatibility())
  }

  close() {
    this.dataScanner?.close()
    this.dataScanner = undefined
    Object.keys(this.activityMonitors).forEach((id) => this.stopActivityMonitor(id))
    // usbDetect.stopMonitoring()
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

  addRequest(req: AccountRequest, res?: RPCCallback<any>) {
    log.info('addRequest', JSON.stringify(req))

    const currentAccount = this.current()
    if (currentAccount && !currentAccount.requests[req.handlerId]) {
      currentAccount.addRequest(req, res)
    }
  }

  removeRequests(handlerId: string) {
    Object.values(this.accounts).forEach((account) => {
      if (account.requests[handlerId]) {
        this.removeRequest(account, handlerId)
      }
    })
  }

  removeRequest(account: FrameAccount, handlerId: string) {
    log.info(`removeRequest(${account.id}, ${handlerId})`)

    account.clearRequest(handlerId)
  }

  declineRequest(handlerId: string) {
    const currentAccount = this.current()

    if (currentAccount && currentAccount.requests[handlerId]) {
      const txRequest = this.getTransactionRequest(currentAccount, handlerId)

      txRequest.status = RequestStatus.Declined
      txRequest.notice = 'Signature Declined'
      txRequest.mode = RequestMode.Monitor

      setTimeout(
        () => this.accounts[currentAccount.address] && this.removeRequest(currentAccount, handlerId),
        1000
      )
      currentAccount.update()
    }
  }

  setRequestPending(req: AccountRequest) {
    const handlerId = req.handlerId
    const currentAccount = this.current()

    log.info('setRequestPending', handlerId)

    if (currentAccount && currentAccount.requests[handlerId]) {
      currentAccount.requests[handlerId].status = RequestStatus.Pending

      const signerType = currentAccount.lastSignerType
      const hwSigner = signerType !== 'seed' && signerType !== 'ring'

      currentAccount.requests[handlerId].notice = hwSigner ? 'See Signer' : ''
      currentAccount.update()
    }
  }

  setRequestError(handlerId: string, err: Error) {
    log.info('setRequestError', handlerId)

    const currentAccount = this.current()

    if (currentAccount && currentAccount.requests[handlerId]) {
      currentAccount.requests[handlerId].status = RequestStatus.Error
      const errorMessage = (err.message || '').toLowerCase()

      if (errorMessage === 'ledger device: invalid data received (0x6a80)') {
        currentAccount.requests[handlerId].notice = 'Ledger Contract Data = No'
      } else if (
        err.message === 'ledger device: condition of use not satisfied (denied by the user?) (0x6985)'
      ) {
        currentAccount.requests[handlerId].notice = 'Ledger Signature Declined'
      } else if (errorMessage.includes('insufficient funds')) {
        currentAccount.requests[handlerId].notice = errorMessage.includes('for gas')
          ? 'insufficient funds for gas'
          : 'insufficient funds'
      } else {
        const notice =
          err && typeof err === 'string'
            ? err
            : err && typeof err === 'object' && err.message && typeof err.message === 'string'
              ? err.message
              : 'Unknown Error' // TODO: Update to normalize input type
        currentAccount.requests[handlerId].notice = notice
      }

      if (currentAccount.requests[handlerId].type === 'transaction') {
        setTimeout(() => {
          const activeAccount = this.current()
          if (activeAccount && activeAccount.requests[handlerId]) {
            activeAccount.requests[handlerId].mode = RequestMode.Monitor
            activeAccount.update()

            setTimeout(
              () => this.accounts[activeAccount.address] && this.removeRequest(activeAccount, handlerId),
              8000
            )
          }
        }, 1500)
      } else {
        setTimeout(
          () => this.accounts[currentAccount.address] && this.removeRequest(currentAccount, handlerId),
          3300
        )
      }

      currentAccount.update()
    }
  }

  setTxSigned(handlerId: string, cb: Callback<void>) {
    log.info('setTxSigned', handlerId)

    const currentAccount = this.current()
    if (!currentAccount) return cb(new Error('No account selected'))

    if (currentAccount.requests[handlerId]) {
      if (
        currentAccount.requests[handlerId].status === RequestStatus.Declined ||
        currentAccount.requests[handlerId].status === RequestStatus.Error
      ) {
        cb(new Error('Request already declined'))
      } else {
        currentAccount.requests[handlerId].status = RequestStatus.Sending
        currentAccount.requests[handlerId].notice = 'Sending'
        currentAccount.update()
        cb(null)
      }
    } else {
      cb(new Error('No valid request for ' + handlerId))
    }
  }

  setTxSent(handlerId: string, hash: string) {
    log.info('setTxSent', handlerId, 'Hash', hash)

    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[handlerId]) {
      const txRequest = this.getTransactionRequest(currentAccount, handlerId)

      txRequest.status = RequestStatus.Verifying
      txRequest.notice = 'Verifying'
      txRequest.mode = RequestMode.Monitor
      currentAccount.update()

      this.recordSubmittedTransaction(currentAccount, handlerId, txRequest, hash)
      store.navClearReq(handlerId, false)
      this.openNextActionableRequest(currentAccount)
      this.txMonitor(currentAccount, handlerId, hash)
    }
  }

  setRequestSuccess(handlerId: string) {
    log.info('setRequestSuccess', handlerId)

    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[handlerId]) {
      currentAccount.requests[handlerId].status = RequestStatus.Success
      currentAccount.requests[handlerId].notice = 'Successful'
      if (currentAccount.requests[handlerId].type === 'transaction') {
        currentAccount.requests[handlerId].mode = RequestMode.Monitor
      } else {
        setTimeout(
          () => this.accounts[currentAccount.address] && this.removeRequest(currentAccount, handlerId),
          3300
        )
      }

      currentAccount.update()
    }
  }

  clearRequestsByOrigin(address: string, origin: string) {
    if (address && origin) {
      const account = this.accounts[address]
      if (account) account.clearRequestsByOrigin(origin)
    }
  }

  remove(address = '') {
    address = address.toLowerCase()

    const currentAccount = this.current()
    if (currentAccount && currentAccount.address === address) {
      store.unsetAccount()

      const defaultAccount = (Object.values(this.accounts).filter((a) => a.address !== address) || [])[0]
      if (defaultAccount) {
        this._current = defaultAccount.id
        defaultAccount.active = true
        defaultAccount.update()
      }
    }

    if (this.accounts[address]) this.accounts[address].close()

    store.removeAccount(address)
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
    previousFee: any
  ) {
    const txRequest = this.getTransactionRequest(currentAccount, handlerId)

    if (userUpdate) {
      txRequest.feesUpdatedByUser = true
      delete txRequest.automaticFeeUpdateNotice
    } else {
      if (!txRequest.automaticFeeUpdateNotice && previousFee) {
        txRequest.automaticFeeUpdateNotice = { previousFee }
      }
    }

    currentAccount.update()
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
    const tx = txRequest.data

    // New max fee per gas
    const newMaxFeePerGas = newBaseFee + maxPriorityFeePerGas
    const maxTotalFee = maxFee(tx)

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

    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee)
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

    const tx = this.getTransactionRequest(currentAccount, handlerId).data

    // New max fee per gas
    const newMaxFeePerGas = currentBaseFee + newMaxPriorityFeePerGas
    const maxTotalFee = maxFee(tx)

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
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee)
  }

  setGasPrice(price: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, gasLimit, gasPrice, txType } = this.txFeeUpdate(price, handlerId, userUpdate)

    // New values
    const newGasPrice = parseInt(this.limitedHexValue(price, 0, 9999 * 1e9), 16)

    // No change
    if (newGasPrice === gasPrice) return

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const tx = txRequest.data
    const maxTotalFee = maxFee(tx)

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
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, previousFee)
  }

  setGasLimit(limit: string, handlerId: string, userUpdate: boolean) {
    const { currentAccount, maxFeePerGas, gasPrice, txType } = this.txFeeUpdate(limit, handlerId, userUpdate)

    // New values
    const newGasLimit = parseInt(this.limitedHexValue(limit, 0, 12.5e6), 16)

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const tx = txRequest.data
    const maxTotalFee = maxFee(tx)

    const fee = txType === '0x2' ? maxFeePerGas : gasPrice
    if (newGasLimit * fee > maxTotalFee) {
      tx.gasLimit = intToHex(Math.floor(maxTotalFee / fee))
    } else {
      tx.gasLimit = intToHex(newGasLimit)
    }

    // Complete update
    this.completeTxFeeUpdate(currentAccount, handlerId, userUpdate, false)
  }

  removeFeeUpdateNotice(handlerId: string, cb: Callback<void>) {
    const currentAccount = this.current()
    if (!currentAccount) return cb(new Error('No account selected while removing fee notice'))

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    if (!txRequest) return cb(new Error(`Could not find request ${handlerId}`))

    delete txRequest.automaticFeeUpdateNotice
    currentAccount.update()

    cb(null)
  }

  adjustNonce(handlerId: string, nonceAdjust: number) {
    const currentAccount = this.current()

    if (nonceAdjust !== 1 && nonceAdjust !== -1) return log.error('Invalid nonce adjustment', nonceAdjust)
    if (!currentAccount) return log.error('No account selected during nonce adjustement', nonceAdjust)

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)

    txRequest.data = Object.assign({}, txRequest.data)

    if (txRequest && txRequest.type === 'transaction') {
      const nonce = txRequest.data && txRequest.data.nonce
      if (nonce) {
        let updatedNonce = parseInt(nonce, 16) + nonceAdjust
        if (updatedNonce < 0) updatedNonce = 0
        const adjustedNonce = intToHex(updatedNonce)

        txRequest.data.nonce = adjustedNonce
        currentAccount.update()
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
              txRequest.data.nonce = adjustedNonce
              currentAccount.update()
            }
          }
        )
      }
    }
  }

  resetNonce(handlerId: string) {
    const currentAccount = this.current()
    if (!currentAccount) return log.error('No account selected during nonce reset')

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    const initialNonce = txRequest.payload.params[0].nonce
    if (initialNonce) {
      txRequest.data.nonce = initialNonce
    } else {
      delete txRequest.data.nonce
    }
    currentAccount.update()
  }

  lockRequest(handlerId: string) {
    // When a request is approved, lock it so that no automatic updates such as fee changes can happen
    const currentAccount = this.current()
    if (currentAccount && currentAccount.requests[handlerId]) {
      ;(currentAccount.requests[handlerId] as TransactionRequest).locked = true
    } else {
      log.error('Trying to lock request ' + handlerId + ' but there is no current account')
    }
  }

  // removeAllAccounts () {
  //   setTimeout(() => {
  //     Object.keys(this.accounts).forEach(id => {
  //       if (this.accounts[id]) this.accounts[id].close()
  //       store.removeAccount(id)
  //       delete this.accounts[id]
  //     })
  //   }, 1000)
  // }
}

export default new Accounts()
