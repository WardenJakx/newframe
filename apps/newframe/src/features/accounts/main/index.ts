import EventEmitter from 'events'

import { addHexPrefix, intToHex } from '@ethereumjs/util'
import type { Account } from '@newframe/schema/accounts'
import type { Address } from '@newframe/schema/address'
import type { ChainId as Chain } from '@newframe/schema/chains'
import type {
  AccountRequest,
  AccessRequest,
  TransactionRequest,
  TypedMessage,
  PermitSignatureRequest
} from '@newframe/schema/request-records'
import {
  ReplacementType,
  RequestStatus,
  RequestMode,
  TxClassification
} from '@newframe/schema/request-records'
import type { EVMError, RPC, RPCRequestCallback, RPCResponsePayload } from '@newframe/schema/rpc'
import type { TransactionData } from '@newframe/schema/transactions'
import { GasFeesSource } from '@newframe/schema/transactions'
import log from 'electron-log'
import { v5 as uuidv5 } from 'uuid'

import { authorizeGatewayOperation, type RequestSource } from '../../../app/main/gateway/requestSource.ts'
import type {
  TransactionHistoryService,
  HistoryRequestHandle
} from '../../../core/services/transactions/history.ts'
import { getSignerType } from '../../../platform/signing/domain/index.ts'
import type { SigningApprovalContext } from '../../../platform/signing/signers/Signer/index.ts'
import type { CanonicalStore, CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Token } from '../../../platform/state-store/state/index.ts'
import type { Callback } from '../../../shared/domain/async.ts'
import { internalOriginId } from '../../../shared/domain/internal-origin.ts'
import { cloneSerializable } from '../../../shared/domain/serialization.ts'
import type { DataScanner } from '../../asset-data/main/externalData/index.ts'
import { chainUsesOptimismFees } from '../../chains/domain/chain/fees.ts'
import type { NameResolutionService } from '../../name-resolution/main/nameResolution.ts'
import type { ApprovalType } from '../../requests/domain/approval.ts'
import type { PromptedRequestLifecyclePort } from '../../requests/main/service.ts'
import { tokensForAccount, toTokenId } from '../../tokens/domain/index.ts'
import { usesBaseFee } from '../../transactions/domain/index.ts'
import type { AccountTransactionPolicyPort } from '../../transactions/main/accountPolicyPort.ts'
import type { ActionType } from '../../transactions/main/actions/index.ts'
import type { RevealService } from '../../transactions/main/reveal.ts'
import type { TransactionSimulationPort } from '../../transactions/main/simulationPort.ts'
import { accountNS } from '../domain/index.ts'
import { getProfileAccountIds } from '../domain/profiles.ts'
import FrameAccount from './Account.ts'
import type { AccountChainRpcPort } from './providerPort.ts'
import type { AccountsRuntime } from './runtime.ts'

function toTransactionsByLayer(requests: Record<string, AccountRequest | undefined>, chainId?: number) {
  return Object.entries(requests)
    .filter((entry): entry is [string, AccountRequest] => entry[1] !== undefined)
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

export type { AccountRequest, AccessRequest, TransactionRequest } from '@newframe/schema/request-records'

type RequestWithId = [string, TransactionRequest]

export interface AccountsDependencies {
  chainRpc: AccountChainRpcPort
  history: TransactionHistoryService
  transactionPolicy: AccountTransactionPolicyPort
  simulation: TransactionSimulationPort
  nameResolution: NameResolutionService
  reveal: RevealService
  runtime: AccountsRuntime
  createDataScanner: (store: CanonicalStoreReader) => DataScanner
  registerTokens?: (tokens: Token[], options: { account: string; source: 'transaction' }) => void
  requests: PromptedRequestLifecyclePort
}

export class Accounts extends EventEmitter {
  accounts: Record<string, FrameAccount | undefined>

  private initialized = false
  private dataScanner?: DataScanner
  private activeProfileAccountIds = new Set<string>()
  private profileObserver?: () => void
  private readonly storeApi = {
    getAccounts: () => this.store.getState().main.accounts as unknown as Record<string, Account | undefined>
  }

  constructor(
    private readonly store: CanonicalStoreReader,
    private readonly dependencies: AccountsDependencies
  ) {
    super()

    this.accounts = {}
  }

  initialize() {
    if (this.initialized) {
      return
    }

    this.activeProfileAccountIds = this.readActiveProfileAccountIds()

    Object.entries(this.storeApi.getAccounts()).forEach(([id, account]) => {
      if (account && !this.accounts[id]) {
        const clonedAccount = cloneSerializable(account) ?? account
        this.accounts[id] = new FrameAccount(
          { ...clonedAccount, lastSignerType: getSignerType(clonedAccount.lastSignerType) },
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

    this.dependencies.history.start()
    this.profileObserver = this.store.subscribe(
      (state) => [state.main.currentProfile, state.main.accounts, state.main.accountOrder] as const,
      () => this.reconcileProfileChainOwners(),
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
    if (!account) {
      return null
    }

    let handle = this.accounts[id]
    if (!handle) {
      const clonedAccount = cloneSerializable(account) ?? account
      handle = new FrameAccount(
        { ...clonedAccount, lastSignerType: getSignerType(clonedAccount.lastSignerType) },
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
      this.accounts[id] = handle
    }

    return handle
  }

  private readActiveProfileAccountIds() {
    const main = this.store.getState().main
    return new Set(getProfileAccountIds(main, main.currentProfile).map((id) => id.toLowerCase()))
  }

  private isActiveProfileAccount(id: string) {
    const activeIds = this.initialized ? this.activeProfileAccountIds : this.readActiveProfileAccountIds()
    return activeIds.has(id.toLowerCase())
  }

  private reconcileProfileChainOwners() {
    const nextActiveIds = this.readActiveProfileAccountIds()
    this.activeProfileAccountIds = nextActiveIds

    Object.entries(this.accounts).forEach(([id, account]) => {
      account?.setProfileActive(nextActiveIds.has(id.toLowerCase()))
    })

    this.dependencies.history.reconcileProfile()
  }

  syncTransactionActivity(account: FrameAccount, request: TransactionRequest) {
    this.dependencies.history.enrich({ address: account.address }, request)
  }

  private historyRequestHandle(account: FrameAccount): HistoryRequestHandle {
    return {
      address: account.address,
      exists: () => this.has(account.address),
      get: (id) => account.getRequest<TransactionRequest>(id),
      list: () => account.requests,
      patch: (id, update) => account.patchRequest<TransactionRequest>(id, update),
      remove: (id) => this.removeRequest(account, id)
    }
  }

  private getTransactionRequest(account: FrameAccount, id: string): TransactionRequest | undefined {
    return account.getRequest(id)
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
      const options = { account: address, source: 'transaction' as const }
      if (this.dependencies.registerTokens) {
        this.dependencies.registerTokens(newTokens, options)
      } else {
        this.store.getState().upsertTokens(newTokens, options)
      }
    }

    return tokens
  }

  trackPositionTokens(address: Address, tokens: Token[]) {
    return this.savePositionTokens(address.toLowerCase(), tokens)
  }

  refreshPositions(address: Address, chainId: number, tokens: Token[]) {
    const normalizedAddress = address.toLowerCase()
    const trackedTokens = this.savePositionTokens(normalizedAddress, tokens)

    if (!this.dataScanner) {
      return false
    }

    this.dataScanner.refreshPositions(normalizedAddress, chainId, trackedTokens)
    return true
  }

  private openNextActionableRequest(account: FrameAccount) {
    const panelNav = this.store.getState().windows.panel.nav as Array<{ view?: string }>
    if (panelNav[0]?.view === 'requestView') {
      return
    }

    const nextRequest = Object.values(account.requests)
      .filter((request): request is AccountRequest => request !== undefined)
      .filter(
        (req) =>
          req.mode !== RequestMode.Monitor &&
          !['confirmed', 'declined', 'error', 'success'].includes(req.status ?? '')
      )
      .sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
      .at(0)

    if (!nextRequest) {
      return
    }

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
    if (!address) {
      return cb(new Error('No address, will not add account'))
    }
    address = address.toLowerCase()

    let account = this.handle(address)
    if (!this.has(address)) {
      log.info(`Account ${address} not found, creating account`)

      const created = 'new:' + this.dependencies.runtime.now()
      const accountMetaId = uuidv5(address, accountNS)
      const accountMeta = (
        this.store.getState().main.accountsMeta as Record<
          string,
          CanonicalStore['main']['accountsMeta'][string] | undefined
        >
      )[accountMetaId] ?? { name }
      const createdAccount = new FrameAccount(
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
      this.accounts[address] = createdAccount
      account = createdAccount
    }

    return cb(null, account ?? undefined)
  }

  rename(id: string, name: string) {
    const account = this.handle(id)
    const nextName = (name || '').trim()
    if (!account || !nextName || account.name === nextName) {
      return
    }

    account.rename(nextName)
    this.dependencies.runtime.schedule(() => this.dependencies.runtime.persistence.flush(), 0)
  }

  current() {
    const currentAccountId = this.store.getState().main.currentAccount
    return currentAccountId ? this.handle(currentAccountId) : null
  }

  private accountForRequest(handlerId: string) {
    return Object.values(this.accounts).find((account) => Boolean(account?.requests[handlerId]))
  }

  private defaultAccountAfterRemoving(address: string) {
    const accountOrder = this.store.getState().main.accountOrder
    const orderedAccount = accountOrder
      .filter((id) => id !== address)
      .map((id) => this.handle(id))
      .find(Boolean)

    const fallbackId = Object.keys(this.storeApi.getAccounts()).find((id) => id !== address)
    return orderedAccount ?? (fallbackId ? this.handle(fallbackId) : null)
  }

  startDataScanner() {
    if (!this.dataScanner) {
      this.dataScanner = this.dependencies.createDataScanner(this.store)
      this.dependencies.history.scannerReady()
    }
  }

  refreshBalances(address?: Address) {
    const currentAddress = this.current()?.address
    const targetAddress = address ?? currentAddress

    if (targetAddress) {
      this.dataScanner?.refreshBalances(targetAddress)
    }
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

  confirmRequestApproval(reqId: string, approvalType: ApprovalType, approvalData: unknown) {
    log.info('confirmRequestApproval', reqId, approvalType)

    const currentAccount = this.current()
    if (currentAccount?.requests[reqId]) {
      currentAccount.approveRequest(reqId, approvalType, approvalData)
    }
  }

  // TODO: can we make this typed for the action type?
  updateRequest(reqId: string, data: unknown, actionId: ActionType) {
    log.verbose('updateRequest', { reqId, actionId, data })

    const currentAccount = this.current()
    const request = currentAccount?.getRequest(reqId)
    if (!currentAccount || !request) {
      return false
    }

    if (request.type === 'transaction') {
      return currentAccount.updateRecognizedAction(reqId, actionId, data as Record<string, unknown>)
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

  async replaceTx(id: string, type: ReplacementType, principal: RequestSource) {
    const currentAccount = this.current()

    return new Promise<void>((resolve, reject) => {
      if (!currentAccount?.requests[id]) {
        return reject(new Error('Could not find request'))
      }
      if (currentAccount.requests[id].type !== 'transaction') {
        return reject(new Error('Request is not transaction'))
      }

      const txRequest = currentAccount.requests[id] as TransactionRequest
      if (txRequest.safeTxHash) {
        return reject(new Error('Safe execution transactions cannot be replaced or cancelled'))
      }

      const data = JSON.parse(JSON.stringify(txRequest.data)) as TransactionData
      const targetChain: Chain = { type: 'ethereum', id: parseInt(data.chainId, 16) }
      const { levels } = this.store.getState().main.chainsMeta.ethereum[targetChain.id].gas.price

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

      const _origin = type === ReplacementType.Speed ? currentAccount.requests[id].origin : internalOriginId

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
          if (res.error) {
            return reject(new Error(res.error.message))
          }
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
      _origin = internalOriginId
    }: { method: string; params: unknown[]; chainId: string; _origin?: string },
    cb: RPCRequestCallback,
    principal?: RequestSource
  ) {
    this.dependencies.chainRpc.send(
      { id: 1, jsonrpc: '2.0', method, params, chainId, _origin },
      cb,
      principal
    )
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

    const account = this.get(id)
    this.store.getState().setAccount({ id })
    cb(null, account)

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
          const gas = this.store.getState().main.chainsMeta.ethereum[chain.id].gas

          if (usesBaseFee(tx)) {
            const { maxBaseFeePerGas, maxPriorityFeePerGas } = gas.price.fees ?? {}
            if (!maxBaseFeePerGas || !maxPriorityFeePerGas) {
              throw new Error('Gas fee data unavailable')
            }
            this.setPriorityFee(maxPriorityFeePerGas, id, false)
            this.setBaseFee(maxBaseFeePerGas, id, false)
          } else {
            const gasPrice = gas.price.levels.fast
            if (!gasPrice) {
              throw new Error('Gas price data unavailable')
            }
            this.setGasPrice(gasPrice, id, false)
          }
        } catch (e) {
          log.error('Could not update gas fees for transaction', e)
        }
      })

      if (chainId === 1) {
        const updateL1GasCost = async ([id, req]: (typeof l2Transactions)[number]) => {
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
        }
        l2Transactions.forEach((transaction) => {
          updateL1GasCost(transaction).catch((error: unknown) =>
            log.error('Could not update L1 gas cost', error)
          )
        })
      }
    }
  }

  unsetSigner(cb: Callback<{ id: string; status: string }>) {
    const summary = { id: '', status: '' }
    cb(null, summary)

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
    currentAccount?.verifyAddress(display, cb)
  }

  getSelectedAddresses() {
    const currentAccount = this.current()
    return currentAccount ? currentAccount.getSelectedAddresses() : []
  }

  getAccounts(cb?: Callback<Array<string>>) {
    const currentAccount = this.current()
    if (!currentAccount) {
      if (cb) {
        cb(new Error('No Account Selected'))
      }
      return
    }

    return currentAccount.getAccounts(cb)
  }

  getCoinbase(cb: Callback<Array<string>>) {
    const currentAccount = this.current()

    if (!currentAccount) {
      return cb(new Error('No Account Selected'))
    }

    currentAccount.getCoinbase(cb)
  }

  signMessage(address: Address, message: string, cb: Callback<string>, context?: SigningApprovalContext) {
    const currentAccount = this.current()

    if (!currentAccount) {
      return cb(new Error('No Account Selected'))
    }
    if (address.toLowerCase() !== currentAccount.getSelectedAddress().toLowerCase()) {
      return cb(new Error('signMessage: Wrong Account Selected'))
    }

    currentAccount.signMessage(message, cb, context)
  }

  signTypedData(
    address: Address,
    typedMessage: TypedMessage,
    cb: Callback<string>,
    context?: SigningApprovalContext
  ) {
    const currentAccount = this.current()

    if (!currentAccount) {
      return cb(new Error('No Account Selected'))
    }
    if (address.toLowerCase() !== currentAccount.getSelectedAddress().toLowerCase()) {
      return cb(new Error('signMessage: Wrong Account Selected'))
    }

    currentAccount.signTypedData(typedMessage, cb, context)
  }

  signTransaction(rawTx: TransactionData, cb: Callback<string>, context?: SigningApprovalContext) {
    const currentAccount = this.current()

    if (!currentAccount) {
      return cb(new Error('No Account Selected'))
    }

    const matchSelected =
      (rawTx.from ?? '').toLowerCase() === currentAccount.getSelectedAddress().toLowerCase()

    if (matchSelected) {
      currentAccount.signTransaction(rawTx, cb, context)
    } else {
      cb(new Error('signMessage: Account does not match currently selected'))
    }
  }

  close() {
    this.profileObserver?.()
    this.profileObserver = undefined
    Object.values(this.accounts).forEach((account) => account?.close())
    this.accounts = {}
    this.dataScanner?.close()
    this.dataScanner = undefined
    this.dependencies.history.close()
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
    currentAccount?.resolveRequest(req, result)
  }

  rejectRequest(req: AccountRequest, error: EVMError) {
    const currentAccount = this.current()
    if (currentAccount) {
      currentAccount.rejectRequest(req, error)
    }
  }

  routeRequest(
    principal: RequestSource,
    req: AccountRequest,
    executeAutonomously?: (request: AccountRequest) => void
  ) {
    this.dependencies.requests.bind(req)
    const decision = authorizeGatewayOperation(principal, req)

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
    if (!account) {
      return false
    }

    this.dependencies.history.trackDetached({
      account: { address: account.address },
      requestId: request.handlerId,
      request,
      hash
    })
    return true
  }

  trackSafeExecution(safeTxHash: string, outerTxHash: string) {
    const normalizedHash = safeTxHash.toLowerCase()
    for (const accountState of Object.values(this.store.getState().main.accounts)) {
      if (!accountState.safe) {
        continue
      }
      for (const [chainIdText, deployment] of Object.entries(accountState.safe)) {
        const proposal = deployment.pending?.find(
          (candidate) => candidate.safeTxHash.toLowerCase() === normalizedHash
        )
        const executorId = proposal?.local?.execution.executorId
        if (!proposal || !executorId) {
          continue
        }
        const account = this.getFrameAccount(accountState.id)
        if (!account) {
          return false
        }
        const chainId = Number(chainIdText)
        const data: TransactionData = {
          chainId: addHexPrefix(chainId.toString(16)),
          type: '0x0',
          gasFeesSource: GasFeesSource.Dapp,
          from: deployment.address,
          to: proposal.to,
          value: addHexPrefix(BigInt(proposal.value).toString(16)),
          data: proposal.data
        }
        const request: TransactionRequest = {
          handlerId: `safe:${normalizedHash}`,
          type: 'transaction',
          origin: proposal.local?.origin ?? internalOriginId,
          account: account.id,
          payload: {
            id: normalizedHash,
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            chainId: data.chainId,
            params: [{ from: deployment.address, to: proposal.to, value: data.value, data: proposal.data }]
          } as RPC.SendTransaction.Request,
          data,
          safeTxHash: normalizedHash,
          safeExecution: {
            executorId,
            ...(proposal.local?.execution.transaction
              ? { reviewedTransaction: proposal.local.execution.transaction }
              : {}),
            submitted: { outerTxHash, executorId }
          },
          approvals: [],
          feesUpdatedByUser: false,
          recipientType: '',
          recognizedActions: [],
          classification:
            proposal.data !== '0x' ? TxClassification.CONTRACT_CALL : TxClassification.NATIVE_TRANSFER
        }
        this.dependencies.history.trackDetached({
          account: { address: account.address },
          requestId: request.handlerId,
          request,
          hash: outerTxHash
        })
        return true
      }
    }
    return false
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
        notice = err.message || 'Unknown Error' // TODO: Update to normalize input type
      }

      requestAccount.patchRequest(handlerId, (request) => {
        request.status = RequestStatus.Error
        request.notice = notice
      })

      const request = requestAccount.requests[handlerId]
      if (request?.type === 'transaction') {
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
    if (!requestAccount) {
      return cb(new Error('No valid request for ' + handlerId))
    }

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
      })

      if (!txRequest) {
        return
      }
      this.dependencies.history.recordSubmission({
        account: { address: requestAccount.address },
        requestId: handlerId,
        request: txRequest,
        hash
      })
      this.store.getState().navClearReq(handlerId, false)
      this.openNextActionableRequest(requestAccount)
      this.dependencies.history
        .monitorRequest(this.historyRequestHandle(requestAccount), handlerId, hash)
        .catch((error: unknown) => log.error('Could not start transaction monitor', error))
    }
  }

  setRequestSuccess(handlerId: string) {
    log.info('setRequestSuccess', handlerId)

    const requestAccount = this.accountForRequest(handlerId)
    if (requestAccount) {
      const isTransaction = requestAccount.requests[handlerId]?.type === 'transaction'
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
      if (account) {
        account.clearRequestsByOrigin(origin)
      }
    }
  }

  remove(address = '') {
    address = address.toLowerCase()
    this.dependencies.history.stopAccount(address)

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
        if (request) {
          handle.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
        }
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
    if (value < min) {
      return intToHex(min)
    }
    if (value > max) {
      return intToHex(max)
    }
    return hexValue
  }

  private txFeeUpdate(inputValue: string, handlerId: string, userUpdate: boolean) {
    // Check value
    if (this.invalidValue(inputValue)) {
      throw new Error('txFeeUpdate, invalid input value')
    }

    // Get current account
    const currentAccount = this.current()
    if (!currentAccount) {
      throw new Error('No account selected while setting base fee')
    }

    const request = this.getTransactionRequest(currentAccount, handlerId)
    if (!request) {
      throw new Error(`Could not find transaction request with handlerId ${handlerId}`)
    }
    if (request.locked) {
      throw new Error('Request has already been approved by the user')
    }
    if (request.feesUpdatedByUser && !userUpdate) {
      throw new Error('Fee has been updated by user')
    }

    const tx = request.data
    const gasLimit = parseInt(tx.gasLimit ?? '0x0', 16)
    const txType = tx.type

    if (usesBaseFee(tx)) {
      const maxFeePerGas = parseInt(tx.maxFeePerGas ?? '0x0', 16)
      const maxPriorityFeePerGas = parseInt(tx.maxPriorityFeePerGas ?? '0x0', 16)
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
    }
    const gasPrice = parseInt(tx.gasPrice ?? '0x0', 16)
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

  private completeTxFeeUpdate(
    currentAccount: FrameAccount,
    handlerId: string,
    userUpdate: boolean,
    previousFee: unknown,
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
    if (newBaseFee === currentBaseFee) {
      return
    }

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    if (!txRequest) {
      throw new Error(`Could not find transaction request with handlerId ${handlerId}`)
    }
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
    if (newMaxPriorityFeePerGas === maxPriorityFeePerGas) {
      return
    }

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    if (!txRequest) {
      throw new Error(`Could not find transaction request with handlerId ${handlerId}`)
    }
    const tx = { ...txRequest.data }

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
    if (newGasPrice === gasPrice) {
      return
    }

    const txRequest = this.getTransactionRequest(currentAccount, handlerId)
    if (!txRequest) {
      throw new Error(`Could not find transaction request with handlerId ${handlerId}`)
    }
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

  lockRequest(handlerId: string) {
    // When a request is approved, lock it so that no automatic updates such as fee changes can happen
    const currentAccount = this.current()
    if (currentAccount?.requests[handlerId]) {
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
