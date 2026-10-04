import crypto from 'crypto'
import EventEmitter from 'events'

import { addHexPrefix, intToHex } from '@ethereumjs/util'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { JsonRpcResponseSchema } from '@newframe/desktop-api/protocol'
import log from 'electron-log'
import { getAddress, isAddress } from 'ethers'
import { shallow } from 'zustand/shallow'

import packageFile from '../../../../package.json' with { type: 'json' }
import { hasAddress } from '../../../features/accounts/domain/index.ts'
import { safeDecodedSchema } from '../../../features/accounts/domain/safe.ts'
import type { SafeTransactionPort } from '../../../features/accounts/main/safeTransactionPort.ts'
import { activeExtensionAccountId } from '../../../features/connections/domain/extensionAccess.ts'
import type { OriginsService } from '../../../features/connections/main/origins.ts'
import type { AccountRequestPort } from '../../../features/connections/main/provider/accountRequestPort.ts'
import {
  checkExistingNonceGas,
  ecRecover,
  gasFees,
  getPermissions,
  getRawTx,
  requestPermissions,
  resError,
  decodeMessage,
  encodePersonalSignMessage
} from '../../../features/connections/main/provider/helpers.ts'
import type { ProviderProxyConnection } from '../../../features/connections/main/provider/proxy.ts'
import type { ProviderStatePort } from '../../../features/connections/main/provider/statePort.ts'
import type { Subscription } from '../../../features/connections/main/provider/subscriptions.ts'
import {
  SubscriptionType,
  hasSubscriptionPermission
} from '../../../features/connections/main/provider/subscriptions.ts'
import { getVersionFromTypedData } from '../../../features/connections/main/provider/typedData.ts'
import type { Chains } from '../../../features/networks/main/index.ts'
import type { Chain } from '../../../features/networks/main/index.ts'
import { estimateL1GasCost } from '../../../features/networks/main/l1GasFees.ts'
import type {
  TransactionRequest,
  SignTypedDataRequest,
  AddChainRequest,
  AddTokenRequest
} from '../../../features/requests/contract/requests.ts'
import type {
  EIP2612TypedData,
  LegacyTypedData,
  PermitSignatureRequest,
  SignatureRequest,
  TypedData,
  TypedMessage
} from '../../../features/requests/contract/requests.ts'
import { ApprovalType } from '../../../features/requests/domain/approval.ts'
import type { PromptedRequestContinuationPort } from '../../../features/requests/main/service.ts'
import { toTokenId } from '../../../features/tokens/domain/index.ts'
import type { Token } from '../../../features/tokens/domain/state/token.ts'
import { resolveWatchAsset } from '../../../features/tokens/main/watchAsset.ts'
import type { TransactionData } from '../../../features/transactions/domain/index.ts'
import { normalizeChainId } from '../../../features/transactions/domain/index.ts'
import {
  populate as populateTransaction,
  classifyTransaction,
  signerCompatibility
} from '../../../features/transactions/main/index.ts'
import type { RevealService } from '../../../features/transactions/main/reveal.ts'
import type { TokenData } from '../../../platform/chain-rpc/contracts/erc20.ts'
import { getSignerType, Type as SignerType } from '../../../platform/signing/domain/index.ts'
import { getCalldataDigest, getEip712Digests } from '../../../platform/signing/signatures/digests.ts'
import * as sigParser from '../../../platform/signing/signatures/index.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Permission } from '../../../platform/state-store/state/index.ts'
import type { Callback } from '../../../shared/domain/async.ts'
import { isNonZeroHex } from '../../../shared/domain/hex.ts'
import type {
  EVMError,
  JSONRPCRequestPayload,
  RPC,
  RPCCallback,
  RPCRequestCallback,
  RPCRequestPayload,
  RPCResponsePayload,
  RPCSuccessCallback
} from '../../../shared/domain/rpc.ts'
import { capitalize } from '../../../shared/domain/text.ts'
import {
  createMainProcessSource,
  hasSourceCapability,
  isAiSessionActive,
  type AiSessionClientSource,
  type RequestSource
} from '../gateway/requestSource.ts'
import { createRpcGateway } from '../gateway/rpc.ts'
import { rpcMethodPolicy } from '../gateway/rpcPolicy.ts'
import { ProtectedOperationsService } from '../protected-operations/service.ts'

export interface TransactionRequestContext {
  tokenData?: TokenData
}

const signTypedDataV4OnlySignerTypes: SignerType[] = [SignerType.Ledger, SignerType.Trezor, SignerType.AirGap]
const proxyPrincipal = createMainProcessSource('provider-proxy', ['wallet:internal-state'])

interface RequiredApproval {
  type: ApprovalType
  data: unknown
}

interface TransactionMetadata {
  tx: TransactionData
  approvals: RequiredApproval[]
}

export interface PreparedAccountTransaction {
  transaction: TransactionData &
    Required<Pick<TransactionData, 'from' | 'to' | 'value' | 'data' | 'nonce' | 'gasLimit'>>
  warnings: string[]
}

type ProviderSubscriptionType = SubscriptionType | 'chainChanged' | 'networkChanged'

type AccountHandle = NonNullable<ReturnType<AccountRequestPort['getFrameAccount']>>
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : []
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function typedDataValue(value: unknown): LegacyTypedData | TypedData | undefined {
  if (Array.isArray(value)) {
    return value as LegacyTypedData
  }
  if (recordValue(value)?.message) {
    return value as TypedData
  }
  return undefined
}

export interface RpcIpcHandlerDependencies {
  exportSecret?: (address: string) => Promise<{ type: string; value: string }>
  origins?: Pick<OriginsService, 'hasAccountAccessGrant'>
  accounts: AccountRequestPort
  chains: Chains
  lookupChainIcon?: (chainId: number) => Promise<string>
  proxy: ProviderProxyConnection
  state: ProviderStatePort
  store: CanonicalStoreReader
  reveal: Pick<RevealService, 'decode' | 'resolveEntityType'>
  requests: PromptedRequestContinuationPort
  safeTransactions?: Pick<SafeTransactionPort, 'prepareDraft' | 'attach'>
  watchAssetMetadata?: (
    address: string,
    chainId: number,
    type: 'ERC20' | 'ERC1046',
    options: Record<string, unknown>
  ) => Promise<Token>
}

export class RpcIpcHandlers extends EventEmitter {
  readonly protectedOperations: ProtectedOperationsService
  connected = false
  private storeUnsubscribes: Array<() => void> = []
  // The account each extension accountsChanged subscription last received.
  private extensionAccountsSent = new Map<string, string>()
  private started = false

  subscriptions: { [key in ProviderSubscriptionType]: Subscription[] } = {
    accountsChanged: [],
    assetsChanged: [],
    chainChanged: [],
    chainsChanged: [],
    networkChanged: []
  }

  private readonly rpcOrigins: RpcIpcHandlerDependencies['origins']
  private readonly dispatchRpc: ReturnType<typeof createRpcGateway>
  private readonly accounts: AccountRequestPort
  readonly connection: Chains
  private readonly lookupChainIcon?: (chainId: number) => Promise<string>
  private readonly proxy: ProviderProxyConnection
  private readonly state: ProviderStatePort
  private readonly store: CanonicalStoreReader
  private readonly reveal: Pick<RevealService, 'decode' | 'resolveEntityType'>
  private readonly requests: PromptedRequestContinuationPort
  private readonly safeTransactions?: Pick<SafeTransactionPort, 'prepareDraft' | 'attach'>
  private readonly watchAssetMetadata: NonNullable<RpcIpcHandlerDependencies['watchAssetMetadata']>

  constructor({
    exportSecret,
    origins,
    accounts,
    chains,
    lookupChainIcon,
    proxy,
    state,
    store,
    reveal,
    requests,
    safeTransactions,
    watchAssetMetadata
  }: RpcIpcHandlerDependencies) {
    super()
    this.protectedOperations = new ProtectedOperationsService(
      accounts,
      chains,
      store,
      (data, respond) => this.getNonce(data, respond),
      exportSecret
    )
    this.rpcOrigins = origins
    this.dispatchRpc = createRpcGateway({
      origins,
      selectedAddresses: () => accounts.getSelectedAddresses(),
      handle: (payload, respond, source) => this.handleRpc(payload, respond, source)
    })
    this.accounts = accounts
    this.connection = chains
    this.lookupChainIcon = lookupChainIcon
    this.proxy = proxy
    this.state = state
    this.store = store
    this.reveal = reveal
    this.requests = requests
    this.safeTransactions = safeTransactions
    this.watchAssetMetadata =
      watchAssetMetadata ??
      ((address, chainId, type, options) => resolveWatchAsset(address, chainId, type, options, this))
    this.getNonce = this.getNonce.bind(this)
  }

  private readonly handleConnectionConnect = (...args: unknown[]) => {
    this.connected = true
    this.emit('connect', ...args)
  }

  private readonly handleConnectionClose = () => {
    this.connected = false
  }

  private readonly handleConnectionData = (chain: Chain, ...args: unknown[]) => {
    if (((args[0] ?? {}) as { method?: string }).method === 'eth_subscription') {
      this.emit('data:subscription', ...args)
    }

    this.emit(`data:${chain.type}:${chain.id}`, ...args)
  }

  private readonly handleConnectionError = (_chain: Chain, error: unknown) => {
    log.error(error)
  }

  private readonly handleConnectionUpdate = (chain: Chain, event: { type: string; status?: string }) => {
    if (event.type === 'status') {
      this.emit(`status:${chain.type}:${chain.id}`, event.status)
    }
  }

  private readonly handleProxySend = (payload: RPCRequestPayload) => {
    const { id } = payload
    let settled = false
    const respond = (response: RPCResponsePayload) => {
      if (settled) {
        return
      }
      settled = true
      const parsed = JsonRpcResponseSchema.safeParse(response)
      this.proxy.emit(
        'payload',
        parsed.success
          ? parsed.data
          : {
              id,
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Invalid JSON-RPC response' }
            }
      )
    }
    Promise.resolve(this.send(payload, respond, proxyPrincipal)).catch((error: unknown) => {
      log.error('Could not handle proxy request', error)
      resError('Internal error', payload, respond)
    })
  }

  private readonly handleProxySubscribe = (payload: RPC.Subscribe.Request) => {
    const subId = this.createSubscription(payload, proxyPrincipal)
    const { id, jsonrpc } = payload

    this.proxy.emit('payload', { id, jsonrpc, result: subId })
  }

  start() {
    if (this.started) {
      return
    }

    this.started = true
    try {
      this.connection.on('connect', this.handleConnectionConnect)
      this.connection.on('close', this.handleConnectionClose)
      this.connection.on('data', this.handleConnectionData)
      this.connection.on('error', this.handleConnectionError)
      this.connection.on('update', this.handleConnectionUpdate)
      this.proxy.on('provider:send', this.handleProxySend)
      this.proxy.on('provider:subscribe', this.handleProxySubscribe)
      this.subscribeToStore()
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  dispose() {
    if (!this.started) {
      return
    }

    this.closeStoreSubscriptions()
    this.connection.off('connect', this.handleConnectionConnect)
    this.connection.off('close', this.handleConnectionClose)
    this.connection.off('data', this.handleConnectionData)
    this.connection.off('error', this.handleConnectionError)
    this.connection.off('update', this.handleConnectionUpdate)
    this.proxy.off('provider:send', this.handleProxySend)
    this.proxy.off('provider:subscribe', this.handleProxySubscribe)
    this.connected = false
    this.started = false
  }

  private subscribeToStore() {
    const chainsObserver = this.state.createChainsObserver(this)
    const originChainObserver = this.state.createOriginChainObserver(this)
    const assetsObserver = this.state.createAssetsObserver(this)

    // Establish the origin baseline before listening so the first change is compared
    // against the state that existed when the provider was created.
    originChainObserver()

    this.storeUnsubscribes.push(
      this.store.subscribe(
        (state) => [state.main.networks.ethereum, state.main.networksMeta.ethereum] as const,
        chainsObserver,
        { equalityFn: shallow }
      ),
      this.store.subscribe((state) => state.main.origins, originChainObserver),
      this.store.subscribe(
        (state) =>
          [
            state.main.currentAccount,
            state.main.currentProfile,
            state.main.accounts,
            state.main.accountOrder,
            state.main.extensionAccess,
            state.main.permissions
          ] as const,
        () => this.extensionAccountsChanged(),
        { equalityFn: shallow }
      ),
      this.store.subscribe(
        (state) =>
          [
            state.main.currentAccount,
            state.main.accounts,
            state.main.balances,
            state.main.networksMeta.ethereum,
            state.main.assetRates
          ] as const,
        assetsObserver,
        { equalityFn: shallow }
      )
    )
  }

  private network(chainId: number) {
    const networks = this.store.getState().main.networks.ethereum as Record<
      number,
      ReturnType<typeof this.store.getState>['main']['networks']['ethereum'][number] | undefined
    >
    return networks[chainId]
  }

  private networkMetadata(chainId: number) {
    const metadata = this.store.getState().main.networksMeta.ethereum as Record<
      number,
      ReturnType<typeof this.store.getState>['main']['networksMeta']['ethereum'][number] | undefined
    >
    return metadata[chainId]
  }

  private origin(originId: string) {
    const origins = this.store.getState().main.origins as Record<
      string,
      ReturnType<typeof this.store.getState>['main']['origins'][string] | undefined
    >
    return origins[originId]
  }

  closeStoreSubscriptions() {
    this.storeUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe())
  }

  private getPayloadOrigin({ _origin }: RPCRequestPayload) {
    return this.origin(_origin)
  }

  accountsChanged(accounts: string[]) {
    const address = accounts[0]

    this.subscriptions.accountsChanged
      .filter(
        (subscription) =>
          !subscription.extensionId &&
          hasSubscriptionPermission(SubscriptionType.ACCOUNTS, address, subscription, this.store)
      )
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, accounts))
  }

  /** Extension subscriptions observe the extension's account, which can differ from the app's. */
  private extensionAccounts(subscription: Subscription) {
    const main = this.store.getState().main
    const accountId = subscription.extensionId ? activeExtensionAccountId(main, subscription.extensionId) : ''
    const address = accountId ? main.accounts[accountId].address.toLowerCase() : ''
    return address && hasSubscriptionPermission(SubscriptionType.ACCOUNTS, address, subscription, this.store)
      ? address
      : ''
  }

  private extensionAccountsChanged() {
    this.subscriptions.accountsChanged.forEach((subscription) => {
      if (!subscription.extensionId) {
        return
      }
      const address = this.extensionAccounts(subscription)
      if (this.extensionAccountsSent.get(subscription.id) !== address) {
        this.extensionAccountsSent.set(subscription.id, address)
        this.sendSubscriptionData(subscription.id, address ? [address] : [])
      }
    })
  }

  /** The account a request acts as: the extension's account for extension sources, else the app's. */
  private accountFor(principal?: RequestSource) {
    const extensionId = principal?.kind === 'rpc' ? principal.extensionId : undefined
    if (!extensionId) {
      return this.accounts.current()
    }
    const accountId = activeExtensionAccountId(this.store.getState().main, extensionId)
    return accountId ? (this.accounts.getFrameAccount(accountId) ?? null) : null
  }

  assetsChanged(address: string, assets: RPC.GetAssets.Assets) {
    this.subscriptions.assetsChanged
      .filter((subscription) =>
        hasSubscriptionPermission(SubscriptionType.ASSETS, address, subscription, this.store)
      )
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, { ...assets, account: address }))
  }

  chainChanged(chainId: number, originId: string) {
    const chain = intToHex(chainId)

    this.subscriptions.chainChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, chain))
  }

  // fires when the list of available chains changes
  chainsChanged(address: string, chains: RPC.GetEthereumChains.Chain[]) {
    this.subscriptions.chainsChanged
      .filter((subscription) => hasSubscriptionPermission('chainsChanged', address, subscription, this.store))
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, chains))
  }

  networkChanged(netId: number | string, originId: string) {
    this.subscriptions.networkChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, netId))
  }

  private sendSubscriptionData(subscription: string, result: unknown) {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription, result }
    } as const

    this.proxy.emit('payload', payload)
    this.emit('data:subscription', payload)
  }

  getNetVersion(payload: RPCRequestPayload, res: RPCRequestCallback, targetChain: Chain) {
    const chain = this.network(targetChain.id)
    const response = chain?.on
      ? { result: targetChain.id }
      : { error: { message: 'not connected', code: -1 } }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, ...response })
  }

  getChainId(payload: RPCRequestPayload, res: RPCSuccessCallback, targetChain: Chain) {
    const chain = this.network(targetChain.id)
    const response = chain?.on
      ? { result: intToHex(targetChain.id) }
      : { error: { message: 'not connected', code: -1 } }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, ...response })
  }

  async getL1GasCost(txData: TransactionData) {
    const { chainId, type, ...tx } = txData

    const txRequest = {
      ...tx,
      type: parseInt(type, 16),
      chainId: parseInt(chainId, 16)
    }

    const connections = this.connection.connections['ethereum'] as Record<
      number,
      (typeof this.connection.connections)['ethereum'][number] | undefined
    >
    const connection = connections[txRequest.chainId]
    const connectedProvider = connection?.primary.connected
      ? connection.primary.provider
      : connection?.secondary.provider

    if (!connectedProvider) {
      return 0n
    }

    return estimateL1GasCost(connectedProvider, txRequest)
  }

  private async getGasEstimate(rawTx: TransactionData) {
    const { from, to, value, data, nonce } = rawTx
    const txParams = { from, to, value, data, nonce }

    const payload: JSONRPCRequestPayload = {
      method: 'eth_estimateGas',
      params: [txParams],
      jsonrpc: '2.0',
      id: 1
    }

    const targetChain: Chain = {
      type: 'ethereum',
      id: parseInt(rawTx.chainId, 16)
    }

    return new Promise<string>((resolve, reject) => {
      this.connection.send(
        payload,
        (response) => {
          if (response.error) {
            log.warn(`error estimating gas for tx to ${txParams.to}: ${response.error.message}`)
            return reject(response.error)
          }

          const estimatedLimit = parseInt(response.result as string, 16)
          const paddedLimit = Math.ceil(estimatedLimit * 1.5)

          log.verbose(
            `gas estimate for tx to ${txParams.to}: ${estimatedLimit}, using ${paddedLimit} as gas limit`
          )
          return resolve(addHexPrefix(paddedLimit.toString(16)))
        },
        targetChain
      )
    })
  }

  getNonce(rawTx: TransactionData, res: RPCRequestCallback) {
    const targetChain: Chain = {
      type: 'ethereum',
      id: parseInt(rawTx.chainId, 16)
    }

    this.connection.send(
      { id: 1, jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [rawTx.from, 'pending'] },
      res,
      targetChain
    )
  }

  async fillTransaction(newTx: RPC.SendTransaction.TxParams, cb: Callback<TransactionMetadata>) {
    const connection = this.connection.connections['ethereum'][parseInt(newTx.chainId, 16)]
    const chainConnected = connection && (connection.primary.connected || connection.secondary.connected)

    if (!chainConnected) {
      return cb(new Error(`Chain ${newTx.chainId} not connected`))
    }

    try {
      const approvals: RequiredApproval[] = []
      const rawTx = getRawTx(newTx)
      await this.connection.refreshGasFees({ type: 'ethereum', id: parseInt(rawTx.chainId, 16) })
      const gas = gasFees(rawTx, this.store)
      const { chainConfig } = connection

      const estimateGasLimit = async () => {
        try {
          return await this.getGasEstimate(rawTx)
        } catch (error) {
          approvals.push({
            type: ApprovalType.GasLimitApproval,
            data: {
              message: (error as Error).message,
              gasLimit: '0x00'
            }
          })
          return '0x00'
        }
      }

      const [gasLimit, recipientType] = await Promise.all([
        rawTx.gasLimit ?? estimateGasLimit(),
        rawTx.to ? this.reveal.resolveEntityType(rawTx.to, parseInt(rawTx.chainId, 16)) : ''
      ])

      const tx = { ...rawTx, gasLimit, recipientType }

      try {
        const populatedTransaction = populateTransaction(tx, chainConfig, gas)
        const checkedTransaction = checkExistingNonceGas(populatedTransaction, this.store)

        log.verbose('Successfully populated transaction', checkedTransaction)

        cb(null, { tx: checkedTransaction, approvals })
      } catch (error) {
        return cb(error as Error)
      }
    } catch (e) {
      log.error('error creating transaction', e)
      cb(e as Error)
    }
  }

  /** Prepare an ordinary EOA transaction without changing the selected account. */
  async prepareAccountTransaction(
    accountId: string,
    transaction: Omit<RPC.SendTransaction.TxParams, 'from'> & { chainId: string }
  ): Promise<PreparedAccountTransaction> {
    const normalizedId = accountId.toLowerCase()
    const account = this.accounts.getFrameAccount(normalizedId)
    if (!account || account.id !== normalizedId || this.accounts.get(normalizedId)?.safe) {
      throw new Error('Executor account is unavailable or is not an ordinary EOA.')
    }
    const metadata = await new Promise<TransactionMetadata>((resolve, reject) => {
      void this.fillTransaction({ ...transaction, from: normalizedId }, (error, value) => {
        if (error || !value) {
          reject(error ?? new Error('Could not prepare executor transaction.'))
        } else {
          resolve(value)
        }
      })
    })
    const nonce = await new Promise<string>((resolve, reject) => {
      this.getNonce(metadata.tx, (response) => {
        if (response.error || typeof response.result !== 'string') {
          reject(
            Object.assign(new Error(response.error?.message ?? 'Could not determine executor nonce.'), {
              code: response.error?.code
            })
          )
        } else {
          resolve(response.result)
        }
      })
    })
    const { feesUpdated: _feesUpdated, recipientType: _recipientType, ...prepared } = metadata.tx
    const candidate = { ...prepared, nonce }
    if (
      !candidate.from ||
      !candidate.to ||
      candidate.value === undefined ||
      candidate.data === undefined ||
      !candidate.gasLimit
    ) {
      throw new Error('Prepared executor transaction is incomplete.')
    }
    const canonical = this.accounts.get(normalizedId)
    const signer = canonical?.signer ? this.store.getState().main.signers[canonical.signer] : undefined
    const compatibility = signer ? signerCompatibility(candidate, signer) : undefined
    return {
      transaction: candidate as PreparedAccountTransaction['transaction'],
      warnings: [
        ...metadata.approvals.map(({ data }) =>
          data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message
            : 'Executor transaction needs additional review.'
        ),
        ...(compatibility && !compatibility.compatible
          ? [`${compatibility.signer} does not support ${compatibility.tx} transactions.`]
          : [])
      ]
    }
  }

  /** Sign and broadcast a reviewed transaction with a named EOA, without changing selection. */
  private requireActiveAgentSession(
    principal: AiSessionClientSource,
    payload: RPCRequestPayload,
    res: RPCRequestCallback
  ) {
    if (isAiSessionActive(principal)) {
      return true
    }
    resError('Agent session is revoked or unavailable', payload, res)
    return false
  }

  // Reads the session's authorized wallet, not the wallet selected in the UI.
  private getAgentAssets(
    payload: RPC.GetAssets.Request,
    principal: AiSessionClientSource,
    res: RPCRequestCallback
  ) {
    if (!this.requireActiveAgentSession(principal, payload, res)) {
      return
    }
    const account = this.accounts.getFrameAccount(principal.aiSession.accountId)
    if (!account || account.id !== principal.aiSession.accountId) {
      return resError('Agent session is not authorized for this account', payload, res)
    }
    return this.getAssets(payload, account, res)
  }

  sendAgentTransaction(
    payload: RPC.SendTransaction.Request,
    principal: AiSessionClientSource,
    res: RPCRequestCallback
  ) {
    if (!this.requireActiveAgentSession(principal, payload, res)) {
      return
    }

    const account = this.accounts.getFrameAccount(principal.aiSession.accountId) as AccountHandle | undefined
    const txParams = (payload.params as unknown[])[0]
    if (!account || !txParams || typeof txParams !== 'object') {
      return resError('Agent transaction is missing its authorized account or transaction', payload, res)
    }

    const payloadChainId = payload.chainId ? parseInt(payload.chainId, 16) : undefined
    const normalized = normalizeChainId(txParams as RPC.SendTransaction.TxParams, payloadChainId)
    const chainId = normalized.chainId || payload.chainId
    if (!chainId || Number.isNaN(parseInt(chainId, 16))) {
      return resError('Agent transaction requires a valid chainId', payload, res)
    }

    const from = (normalized.from ?? account.id).toLowerCase()
    if (from !== principal.aiSession.accountId || from !== account.id) {
      return resError('Agent session is not authorized for the transaction account', payload, res)
    }

    // fillTransaction reports preparation failures through its callback.
    void this.fillTransaction({ ...normalized, from, chainId }, (error, transactionMetadata) => {
      if (error || !transactionMetadata) {
        return resError(error ?? 'Could not prepare transaction', payload, res)
      }
      if (transactionMetadata.approvals.length > 0) {
        return resError('Agent transaction requires an explicit user approval', payload, res)
      }

      const { feesUpdated: _feesUpdated, recipientType, ...data } = transactionMetadata.tx
      const handlerId = this.requests.create(res)
      const respond = (response: RPCResponsePayload) => this.requests.respond(handlerId, response)
      const unclassifiedRequest = {
        handlerId,
        type: 'transaction',
        data,
        payload,
        account: account.id,
        origin: 'newframe-agent',
        approvals: [],
        feesUpdatedByUser: false,
        recipientType,
        recognizedActions: []
      } as Omit<TransactionRequest, 'classification'>
      const request = {
        ...unclassifiedRequest,
        classification: classifyTransaction(unclassifiedRequest)
      } as TransactionRequest

      this.accounts.routeRequest(principal, request, (authorizedRequest) => {
        this.protectedOperations.executeAgentTransaction(
          authorizedRequest as TransactionRequest,
          principal,
          respond
        )
      })
    })
  }

  sendAgentPersonalSign(
    payload: RPCRequestPayload,
    principal: AiSessionClientSource,
    res: RPCRequestCallback
  ) {
    if (!this.requireActiveAgentSession(principal, payload, res)) {
      return
    }

    const account = this.accounts.getFrameAccount(principal.aiSession.accountId)
    const params = arrayValue(payload.params)
    const orderedParams: readonly unknown[] =
      isAddress(params[0]) && !isAddress(params[1]) ? [...params] : [params[1], params[0], ...params.slice(2)]
    const [requestedAddress, rawMessage] = orderedParams

    if (!account || typeof requestedAddress !== 'string' || typeof rawMessage !== 'string' || !rawMessage) {
      return resError('Agent sign request requires an authorized account and message', payload, res)
    }

    const address = requestedAddress.toLowerCase()
    if (address !== principal.aiSession.accountId || address !== account.id) {
      return resError('Agent session is not authorized for the sign request account', payload, res)
    }

    const message = encodePersonalSignMessage(rawMessage)

    const normalizedPayload = { ...payload, params: [account.id, message, ...orderedParams.slice(2)] }
    const handlerId = this.requests.create(res)
    const respond = (response: RPCResponsePayload) => this.requests.respond(handlerId, response)
    const request: SignatureRequest = {
      handlerId,
      type: 'sign',
      payload: normalizedPayload,
      account: account.id,
      chainId: this.parseTargetChain(normalizedPayload)?.id ?? 1,
      origin: 'newframe-agent',
      data: { decodedMessage: decodeMessage(message) }
    }

    this.accounts.routeRequest(principal, request, () => {
      this.protectedOperations.signAiSessionMessage(message, normalizedPayload, principal, respond)
    })
  }

  sendAgentTypedData(
    rawPayload: RPC.SignTypedData.Request,
    principal: AiSessionClientSource,
    res: RPCRequestCallback
  ) {
    if (!this.requireActiveAgentSession(principal, rawPayload, res)) {
      return
    }

    const account = this.accounts.getFrameAccount(principal.aiSession.accountId)
    const rawParams = arrayValue(rawPayload.params)
    const orderedParams: readonly unknown[] =
      isAddress(rawParams[1]) && !isAddress(rawParams[0])
        ? [rawParams[1], rawParams[0], ...rawParams.slice(2)]
        : [...rawParams]
    const [requestedAddress, rawTypedData, ...additionalParams] = orderedParams

    if (!account || typeof requestedAddress !== 'string' || !rawTypedData) {
      return resError('Agent typed-data request requires an authorized account and data', rawPayload, res)
    }

    const address = requestedAddress.toLowerCase()
    if (address !== principal.aiSession.accountId || address !== account.id) {
      return resError('Agent session is not authorized for the typed-data account', rawPayload, res)
    }

    let parsedTypedData: unknown = rawTypedData
    if (typeof parsedTypedData === 'string') {
      try {
        parsedTypedData = JSON.parse(parsedTypedData) as unknown
      } catch {
        return resError('Malformed typed data', rawPayload, res)
      }
    }

    const typedData = typedDataValue(parsedTypedData)
    if (!typedData || Array.isArray(typedData)) {
      return resError('Typed data missing message', rawPayload, res)
    }
    const validatedTypedData = typedData

    let explicitVersion: SignTypedDataVersion | undefined
    if (rawPayload.method.endsWith('_v3')) {
      explicitVersion = SignTypedDataVersion.V3
    } else if (rawPayload.method.endsWith('_v4')) {
      explicitVersion = SignTypedDataVersion.V4
    }
    const version = explicitVersion ?? getVersionFromTypedData(validatedTypedData)
    if (![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(version)) {
      return resError('Agent typed-data signing supports only v3 and v4', rawPayload, res)
    }

    const payload = {
      ...rawPayload,
      params: [account.id, validatedTypedData, ...additionalParams]
    } as RPC.SignTypedData.Request
    const typedMessage: TypedMessage = { data: validatedTypedData, version }
    const digests = getEip712Digests(typedMessage)
    const handlerId = this.requests.create(res)
    const respond = (response: RPCResponsePayload) => this.requests.respond(handlerId, response)
    const request: SignTypedDataRequest = {
      handlerId,
      type: 'signTypedData',
      typedMessage,
      ...(digests ? { digests } : {}),
      payload,
      account: account.id,
      chainId: this.parseTargetChain(payload)?.id ?? 1,
      origin: 'newframe-agent'
    }

    this.accounts.routeRequest(principal, request, () => {
      this.protectedOperations.signAiSessionTypedData(typedMessage, payload, principal, respond)
    })
  }

  async sendTransaction(
    payload: RPC.SendTransaction.Request,
    res: RPCRequestCallback,
    targetChain: Chain,
    principal: RequestSource,
    context?: TransactionRequestContext
  ) {
    try {
      const txParams = payload.params[0]
      const payloadChain = payload.chainId

      const normalizedTx = normalizeChainId(txParams, payloadChain ? parseInt(payloadChain, 16) : undefined)
      const tx = {
        ...normalizedTx,
        chainId: (normalizedTx.chainId || payloadChain) ?? addHexPrefix(targetChain.id.toString(16))
      }

      const currentAccount = this.accounts.current()

      log.verbose(`sendTransaction(${JSON.stringify(tx)}`)

      const from = tx.from ?? currentAccount?.id

      if (!currentAccount || !from || !hasAddress(currentAccount, from)) {
        const accountId = (tx.from ?? '').toLowerCase()

        if (accountId && this.accounts.get(accountId)) {
          return this.accounts.setSigner(accountId, (err) => {
            if (err) {
              return resError(err, payload, res)
            }
            void this.sendTransaction(payload, res, targetChain, principal, context)
          })
        }

        return resError('Transaction is not from currently selected account', payload, res)
      }

      const safeDeployments = this.accounts.get(currentAccount.id)?.safe
      if (safeDeployments) {
        const deploymentKey = String(targetChain.id)
        const safeDeployment = Object.hasOwn(safeDeployments, deploymentKey)
          ? safeDeployments[deploymentKey]
          : undefined
        if (!safeDeployment) {
          return resError(`Safe is not configured on chain ${targetChain.id}`, payload, res)
        }
        if (!this.safeTransactions) {
          return resError('Safe transaction capability is unavailable', payload, res)
        }
        const raw = txParams as RPC.SendTransaction.TxParams & Record<string, unknown>
        if (!raw.to) {
          return resError('Safe contract creation is not supported', payload, res)
        }
        const unsupported = [
          'nonce',
          'operation',
          'delegatecall',
          'safeTxGas',
          'baseGas',
          'gasToken',
          'refundReceiver'
        ].find((field) => raw[field] !== undefined)
        if (unsupported) {
          return resError(`Safe transaction field ${unsupported} is not supported`, payload, res)
        }

        const inner = getRawTx({
          from: currentAccount.id,
          to: raw.to,
          value: raw.value,
          data: raw.data,
          chainId: addHexPrefix(targetChain.id.toString(16))
        })
        let localDecoded
        if (inner.data && isNonZeroHex(inner.data)) {
          try {
            const decoded = await this.reveal.decode(inner.to!, targetChain.id, inner.data)
            if (decoded) {
              const parsed = safeDecodedSchema.extend({ source: safeDecodedSchema.shape.method }).safeParse({
                method: decoded.method,
                parameters: decoded.args,
                source: decoded.source
              })
              if (parsed.success) {
                localDecoded = parsed.data
              }
            }
          } catch (error) {
            log.warn('Unable to decode Safe transaction calldata locally', error)
          }
        }
        const draft = this.safeTransactions.prepareDraft({
          accountId: currentAccount.id,
          chainId: targetChain.id,
          to: inner.to!,
          value: BigInt(inner.value ?? '0x0').toString(),
          data: inner.data,
          operation: 0,
          origin: payload._origin,
          ...(localDecoded ? { localDecoded } : {})
        })
        const handlerId = this.requests.create(res)
        const unclassifiedReq = {
          handlerId,
          type: 'transaction',
          data: inner,
          safeTxHash: draft.proposal.safeTxHash,
          payload,
          account: currentAccount.id,
          origin: payload._origin,
          approvals: [],
          feesUpdatedByUser: false,
          recipientType: '',
          ...(context?.tokenData ? { tokenData: context.tokenData } : {}),
          recognizedActions: []
        } as Omit<TransactionRequest, 'classification'>
        const req: TransactionRequest = {
          ...unclassifiedReq,
          classification: classifyTransaction(unclassifiedReq)
        }
        if (!this.accounts.routeRequest(principal, req)) {
          return
        }
        try {
          this.safeTransactions.attach(draft, handlerId)
        } catch (error) {
          currentAccount.rejectRequest(req, {
            code: -1,
            message: error instanceof Error ? error.message : 'Safe proposal could not be attached'
          })
        }
        return
      }

      // fillTransaction reports preparation failures through its callback.
      void this.fillTransaction({ ...tx, from }, (err, transactionMetadata) => {
        if (err) {
          resError(err, payload, res)
        } else {
          const handlerId = this.requests.create(res)
          const txMetadata = transactionMetadata as TransactionMetadata
          const { feesUpdated, recipientType, ...data } = txMetadata.tx
          const calldata = data.data
          const calldataDigest = calldata && isNonZeroHex(calldata) ? getCalldataDigest(calldata) : undefined

          const unclassifiedReq = {
            handlerId,
            type: 'transaction',
            data: {
              ...data,
              ...(calldataDigest ? { calldataDigest } : {})
            },
            payload,
            account: currentAccount.id,
            origin: payload._origin,
            approvals: txMetadata.approvals.map(({ type, data }) => ({
              type,
              data,
              approved: false
            })),
            feesUpdatedByUser: false,
            recipientType,
            ...(context?.tokenData ? { tokenData: context.tokenData } : {}),
            recognizedActions: []
          } as Omit<TransactionRequest, 'classification'>

          const classification = classifyTransaction(unclassifiedReq)

          const req = {
            ...unclassifiedReq,
            classification
          }

          this.accounts.routeRequest(principal, req)
        }
      })
    } catch (e) {
      resError((e as Error).message, payload, res)
    }
  }

  getTransactionByHash(payload: RPCRequestPayload, cb: RPCRequestCallback, targetChain: Chain) {
    const res: RPCRequestCallback = (response) => {
      if (isRecord(response.result) && !response.result.gasPrice && response.result.maxFeePerGas) {
        return cb({ ...response, result: { ...response.result, gasPrice: response.result.maxFeePerGas } })
      }

      cb(response)
    }

    this.connection.send(payload, res, targetChain)
  }

  _personalSign(
    payload: RPCRequestPayload,
    res: RPCRequestCallback,
    principal: RequestSource,
    chainId?: number
  ) {
    const params = arrayValue(payload.params)

    if (isAddress(params[0]) && !isAddress(params[1])) {
      // personal_sign requests expect the first parameter to be the message and the second
      // parameter to be an address. however some clients send these in the opposite order
      // so try to detect that
      return this.sign(payload, res, principal, chainId)
    }

    // switch the order of params to be consistent with eth_sign
    return this.sign(
      { ...payload, params: [params[1], params[0], ...params.slice(2)] },
      res,
      principal,
      chainId
    )
  }

  sign(payload: RPCRequestPayload, res: RPCRequestCallback, principal: RequestSource, chainId?: number) {
    const [fromValue, messageValue] = arrayValue(payload.params)
    const from = typeof fromValue === 'string' ? fromValue : ''
    const message = typeof messageValue === 'string' ? messageValue : ''
    const currentAccount = this.accounts.current()

    if (!message) {
      return resError('Sign request requires a message param', payload, res)
    }

    if (!currentAccount || !hasAddress(currentAccount, from)) {
      return resError('Sign request is not from currently selected account', payload, res)
    }

    const handlerId = this.requests.create(res)

    const req = {
      handlerId,
      type: 'sign',
      payload,
      account: currentAccount.getAccounts()[0],
      chainId: chainId ?? this.parseTargetChain(payload)?.id ?? 1,
      origin: payload._origin,
      data: {
        decodedMessage: decodeMessage(message)
      }
    } as SignatureRequest

    this.accounts.routeRequest(principal, req)
  }

  signTypedData(
    rawPayload: RPC.SignTypedData.Request,
    version: SignTypedDataVersion | undefined,
    res: RPCCallback<RPC.SignTypedData.Response>,
    principal: RequestSource,
    chainId?: number
  ) {
    // ensure param order is [address, data, ...] regardless of version
    const rawParams = arrayValue(rawPayload.params)
    const orderedParams: unknown[] =
      isAddress(rawParams[1]) && !isAddress(rawParams[0])
        ? [rawParams[1], rawParams[0], ...rawParams.slice(2)]
        : [...rawParams]

    const payload = {
      ...rawPayload,
      params: orderedParams
    }

    const [fromValue, rawTypedData, ...additionalParams] = payload.params
    const from = typeof fromValue === 'string' ? fromValue : ''
    let parsedTypedData: unknown = rawTypedData

    if (!parsedTypedData) {
      return resError(`Missing typed data`, payload, res)
    }

    // HACK: Standards clearly say, that second param is an object but it seems like in the wild it can be a JSON-string.
    if (typeof parsedTypedData === 'string') {
      try {
        parsedTypedData = JSON.parse(parsedTypedData) as unknown
      } catch (e) {
        return resError('Malformed typed data', payload, res)
      }
    }

    const typedData = typedDataValue(parsedTypedData)
    if (!typedData) {
      return resError('Typed data missing message', payload, res)
    }
    payload.params = [from, typedData, ...additionalParams]
    const validatedTypedData = typedData

    // no explicit version called so we choose one which best fits the data
    version ??= getVersionFromTypedData(validatedTypedData)

    const targetAccount = this.accounts.get(from.toLowerCase())

    if (!targetAccount) {
      return resError(`Unknown account: ${from}`, payload, res)
    }

    const currentAccount = this.accounts.current()
    if (!currentAccount || !hasAddress(currentAccount, targetAccount.id)) {
      return resError('Sign request is not from currently selected account', payload, res)
    }

    const signerType = getSignerType(targetAccount.lastSignerType)

    // check for signers that only support signing a specific version of typed data
    if (
      version !== SignTypedDataVersion.V4 &&
      signerType &&
      signTypedDataV4OnlySignerTypes.includes(signerType)
    ) {
      const signerName = capitalize(signerType)
      return resError(`${signerName} only supports eth_signTypedData_v4+`, payload, res)
    }
    if (
      ![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(version) &&
      signerType === SignerType.Lattice
    ) {
      return resError('Lattice only supports eth_signTypedData_v3+', payload, res)
    }

    const handlerId = this.requests.create(res as RPCRequestCallback)
    const typedMessage: TypedMessage<typeof version> = {
      data: validatedTypedData,
      version
    }
    const digests = getEip712Digests(typedMessage)

    const type = sigParser.identify(typedMessage)

    const req: SignTypedDataRequest = {
      handlerId,
      type: 'signTypedData',
      typedMessage,
      ...(digests ? { digests } : {}),
      payload,
      account: targetAccount.address,
      chainId: chainId ?? this.parseTargetChain(payload)?.id ?? 1,
      origin: payload._origin
    }

    // TODO: all of this below code to construct the original request can be added to
    // a module like the above sigparser which, instead of identifying the request, creates it
    if (type === 'signErc20Permit') {
      const {
        message: { deadline, spender: spenderAddress, value, owner, nonce },
        domain: { verifyingContract: contractAddress, chainId }
      } = typedMessage.data as EIP2612TypedData

      const permitRequest: PermitSignatureRequest = {
        ...req,
        type: 'signErc20Permit',
        typedMessage: {
          data: typedMessage.data as EIP2612TypedData,
          version: SignTypedDataVersion.V4
        },
        permit: {
          deadline,
          value,
          owner,
          chainId,
          nonce,
          spender: {
            address: spenderAddress,
            ens: '',
            type: ''
          },
          verifyingContract: {
            address: contractAddress,
            ens: '',
            type: ''
          }
        },
        tokenData: {
          name: '',
          symbol: ''
        }
      }

      this.accounts.routeRequest(principal, permitRequest)
    } else {
      this.accounts.routeRequest(principal, req)
    }
  }

  subscribe(payload: RPC.Subscribe.Request, res: RPCSuccessCallback, principal?: RequestSource) {
    log.debug('provider subscribe', { payload })

    const subId = this.createSubscription(payload, principal)

    res({ id: payload.id, jsonrpc: '2.0', result: subId })
  }

  private createSubscription(payload: RPC.Subscribe.Request, principal?: RequestSource) {
    const subId = addHexPrefix(crypto.randomBytes(16).toString('hex'))
    const subscriptionType = payload.params[0] as ProviderSubscriptionType

    const subscription: Subscription = {
      id: subId,
      originId: payload._origin,
      capabilities:
        principal && (principal.kind === 'rpc' || principal.kind === 'main') ? principal.capabilities : [],
      ...(principal?.kind === 'rpc' && principal.extensionId ? { extensionId: principal.extensionId } : {})
    }
    this.subscriptions[subscriptionType].push(subscription)
    if (subscriptionType === 'accountsChanged' && subscription.extensionId) {
      this.extensionAccountsSent.set(subId, this.extensionAccounts(subscription))
    }

    return subId
  }

  ifSubRemove(id: string) {
    return Object.keys(this.subscriptions).some((type) => {
      const subscriptionType = type as ProviderSubscriptionType
      const index = this.subscriptions[subscriptionType].findIndex((sub) => sub.id === id)
      this.extensionAccountsSent.delete(id)

      return index > -1 && this.subscriptions[subscriptionType].splice(index, 1)
    })
  }

  clientVersion(payload: RPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: '2.0', result: `Newframe/v${packageFile.version}` })
  }

  private getOriginConnection(payload: RPCRequestPayload, principal?: RequestSource) {
    const originId = payload._origin
    const origin = this.origin(originId)
    const currentAccount = this.accountFor(principal)
    const rawAddress = currentAccount?.address ?? currentAccount?.id ?? ''
    const address = rawAddress ? rawAddress.toLowerCase() : ''
    const permissionAddresses = Array.from(
      new Set([rawAddress, address].filter(Boolean).map((candidate) => candidate.toString()))
    )

    let permissionAddress = ''
    let permissionId = ''
    let permission: Permission | undefined

    for (const candidate of permissionAddresses) {
      const state = this.store.getState()
      const permissionsByAddress = state.main.permissions as Record<
        string,
        (typeof state.main.permissions)[string] | undefined
      >
      const permissions = permissionsByAddress[candidate] ?? {}
      const permissionEntry = Object.entries(permissions).find(([id, p]) => {
        return id === originId || p.handlerId === originId || p.origin === origin?.name
      })

      if (permissionEntry) {
        const [id, foundPermission] = permissionEntry
        permissionAddress = candidate
        permissionId = id
        permission = foundPermission
        break
      }
    }

    const chainId = origin?.chain.id ? intToHex(origin.chain.id) : undefined

    return {
      originId,
      originName: origin?.name ?? '',
      address,
      permissionAddress,
      permissionId,
      connected: Boolean(address && permission?.provider),
      chainId
    }
  }

  private sendOriginAccountsChanged(originId: string, nextAccounts: string[]) {
    this.subscriptions.accountsChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, nextAccounts))
  }

  private getOriginStatus(payload: RPCRequestPayload, res: RPCSuccessCallback, principal?: RequestSource) {
    const { originId, originName, address, connected, chainId } = this.getOriginConnection(payload, principal)
    const selectedAddress = hasSourceCapability(principal, 'wallet:internal-state') ? address : ''

    res({
      id: payload.id,
      jsonrpc: payload.jsonrpc,
      result: {
        originId,
        origin: originName,
        connected,
        address: connected ? address : '',
        selectedAddress,
        chainId
      }
    })
  }

  private disconnectOrigin(payload: RPCRequestPayload, res: RPCSuccessCallback, principal?: RequestSource) {
    const { originId, originName, address, permissionAddress, permissionId, chainId } =
      this.getOriginConnection(payload, principal)

    if (permissionAddress && permissionId) {
      this.store.getState().revokePermission(permissionAddress, permissionId)
    }

    if (address) {
      this.accounts.clearRequestsByOrigin(address, originId)
    }

    this.store.getState().endOriginSession(originId)
    this.sendOriginAccountsChanged(originId, [])

    res({
      id: payload.id,
      jsonrpc: payload.jsonrpc,
      result: {
        originId,
        origin: originName,
        connected: false,
        address: '',
        chainId
      }
    })
  }

  private switchEthereumChain(payload: RPCRequestPayload, res: RPCRequestCallback) {
    try {
      const params = payload.params
      if (!isRecord(params[0])) {
        throw new Error('Params not supplied')
      }

      const requestedChainId = recordValue(params[0])?.chainId
      if (typeof requestedChainId !== 'string' || !/^0x[0-9a-f]+$/i.test(requestedChainId)) {
        throw new Error('Invalid chain id')
      }
      const chainId = Number(BigInt(requestedChainId))
      if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        throw new Error('Invalid chain id')
      }

      // Check if chain exists
      const exists = Boolean(this.store.getState().main.networks.ethereum[chainId]?.on)
      if (!exists) {
        const err: EVMError = { message: 'Chain does not exist', code: 4902 }
        return resError(err, payload, res)
      }

      const originId = payload._origin
      const origin = this.getPayloadOrigin(payload)
      if (!origin) {
        return resError('Unknown origin', payload, res)
      }
      if (origin.chain.id !== chainId) {
        this.store.getState().switchOriginChain(originId, chainId, origin.chain.type)
      }

      return res({ id: payload.id, jsonrpc: '2.0', result: null })
    } catch (e) {
      return resError(e as EVMError, payload, res)
    }
  }

  private async addEthereumChain(
    payload: RPCRequestPayload,
    res: RPCRequestCallback,
    principal: RequestSource
  ) {
    if (!isRecord(payload.params[0])) {
      return resError('addChain request missing params', payload, res)
    }

    const type = 'ethereum'
    const { chainId, chainName, nativeCurrency, rpcUrls = [], blockExplorerUrls = [] } = payload.params[0]

    if (!chainId) {
      return resError('addChain request missing chainId', payload, res)
    }
    if (typeof chainId !== 'string' || !/^0x[0-9a-f]+$/i.test(chainId)) {
      return resError('Invalid chain id', payload, res)
    }

    const id = Number(BigInt(chainId))
    if (!Number.isSafeInteger(id) || id <= 0) {
      return resError('Invalid chain id', payload, res)
    }

    const existing = this.network(id)
    if (existing?.on) {
      return this.switchEthereumChain(payload, res)
    }

    const validHttpUrl = (value: unknown) => {
      try {
        const parsed = new URL(String(value))
        return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      } catch {
        return false
      }
    }
    if (!existing) {
      if (typeof chainName !== 'string' || !chainName.trim()) {
        return resError('addChain request missing chainName', payload, res)
      }
      if (
        !isRecord(nativeCurrency) ||
        typeof nativeCurrency.name !== 'string' ||
        typeof nativeCurrency.symbol !== 'string' ||
        nativeCurrency.decimals !== 18
      ) {
        return resError('Invalid nativeCurrency', payload, res)
      }
      if (!Array.isArray(rpcUrls) || rpcUrls.length === 0 || !rpcUrls.every(validHttpUrl)) {
        return resError('Invalid RPC URL', payload, res)
      }
      if (!Array.isArray(blockExplorerUrls) || !blockExplorerUrls.every(validHttpUrl)) {
        return resError('Invalid block explorer URL', payload, res)
      }
    }

    const customChainName = chainName as string
    const customCurrency = nativeCurrency as { decimals: number; name: string; symbol: string }
    const customRpcUrls = rpcUrls as string[]
    const customExplorerUrls = blockExplorerUrls as string[]

    const metadata = this.networkMetadata(id)
    let icon = typeof metadata?.icon === 'string' ? metadata.icon.trim() : ''
    if (!icon && this.lookupChainIcon) {
      try {
        icon = await this.lookupChainIcon(id)
      } catch (error) {
        log.warn('Could not look up Chainlist icon', { chainId: id, error })
      }
    }

    const handlerId = this.requests.create(res)
    const requestChain = existing
      ? {
          id,
          type,
          name: existing.name,
          symbol: metadata?.nativeCurrency.symbol ?? existing.symbol ?? '',
          explorer: existing.explorer,
          ...(icon ? { icon } : {})
        }
      : {
          type,
          id,
          name: customChainName.trim(),
          symbol: customCurrency.symbol,
          primaryRpc: customRpcUrls[0],
          secondaryRpc: customRpcUrls[1],
          explorer: customExplorerUrls[0] ?? '',
          nativeCurrencyName: customCurrency.name,
          ...(icon ? { icon } : {})
        }
    this.accounts.routeRequest(principal, {
      handlerId,
      type: 'addChain',
      chain: requestChain,
      account: (this.accounts.getAccounts() ?? [])[0],
      origin: payload._origin,
      payload
    } as AddChainRequest)
  }

  private addCustomToken(
    payload: RPCRequestPayload,
    cb: RPCRequestCallback,
    targetChain: Chain,
    principal: RequestSource
  ) {
    const tokenParams = isRecord(payload.params) ? payload.params : undefined
    const type = tokenParams?.type
    const tokenData = tokenParams?.options

    if ((type !== 'ERC20' && type !== 'ERC1046') || !isRecord(tokenData)) {
      return resError('only ERC-20 and ERC-1046 tokens are supported', payload, cb)
    }

    const requestedAddress = tokenData.address
    if (typeof requestedAddress !== 'string' || !isAddress(requestedAddress)) {
      return resError('tokens must define a valid address', payload, cb)
    }
    if (getAddress(requestedAddress) !== requestedAddress) {
      return resError('token address must be checksummed', payload, cb)
    }
    const requestedChainId = tokenData.chainId ?? targetChain.id
    if (!Number.isSafeInteger(requestedChainId) || Number(requestedChainId) <= 0) {
      return resError('invalid token chain ID', payload, cb)
    }
    const chainId = Number(requestedChainId)
    const network = (
      this.store.getState().main.networks.ethereum as Record<number, { on: boolean } | undefined>
    )[chainId]
    if (!network?.on) {
      return resError('token chain is not connected', payload, cb)
    }

    this.getChainId(
      payload,
      (resp: RPCResponsePayload) => {
        void (async () => {
          if (resp.error) {
            return resError(resp.error, payload, cb)
          }

          const address = requestedAddress.toLowerCase()

          // don't attempt to add the token if it's already been added
          const knownToken = (this.store.getState().main.tokens.byId as Record<string, Token | undefined>)[
            toTokenId({ chainId, address })
          ]
          if (knownToken?.custom) {
            return cb({ id: payload.id, jsonrpc: '2.0', result: true })
          }

          let token: Token
          try {
            token = await this.watchAssetMetadata(address, chainId, type, tokenData)
          } catch (error) {
            return resError(
              error instanceof Error ? error.message : 'Could not load token metadata',
              payload,
              cb
            )
          }

          token = {
            ...token,
            image: knownToken?.image ?? token.image
          }
          if (knownToken?.logoURI) {
            token.logoURI = knownToken.logoURI
          }
          const similarToken = Object.values(this.store.getState().main.tokens.byId).find(
            (known) =>
              toTokenId(known) !== toTokenId(token) &&
              (known.symbol.toLowerCase() === token.symbol.toLowerCase() ||
                known.name.toLowerCase() === token.name.toLowerCase())
          )
          const account = this.accounts.current()
          if (!account) {
            return resError('no account selected', payload, cb)
          }

          const handlerId = this.requests.create(() => {})
          cb({ id: payload.id, jsonrpc: '2.0', result: true })

          this.accounts.routeRequest(principal, {
            handlerId,
            type: 'addToken',
            token,
            ...(similarToken
              ? { warning: 'Another token uses this name or symbol. Check the contract address.' }
              : {}),
            account: account.id,
            origin: payload._origin,
            payload
          } as AddTokenRequest)
        })().catch((error: unknown) => log.error('Could not route token suggestion', error))
      },
      { type: 'ethereum', id: chainId }
    )
  }

  private parseTargetChain(payload: RPCRequestPayload): Chain | undefined {
    if ('chainId' in payload) {
      const chainId = parseInt(payload.chainId ?? '', 16)
      const chainConnection = this.connection.connections['ethereum'][chainId]
      return chainConnection ? { type: 'ethereum', id: chainId } : undefined
    }

    return this.getPayloadOrigin(payload)?.chain
  }

  private getChains(payload: JSONRPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: this.state.getActiveChains() })
  }

  private getAssets(
    payload: RPC.GetAssets.Request,
    account: AccountHandle | null,
    cb: RPCCallback<RPC.GetAssets.Response>
  ) {
    if (!account) {
      return resError('no account selected', payload, cb)
    }

    try {
      const { nativeCurrency, erc20 } = this.state.loadAssets(account.id)
      const { id, jsonrpc } = payload

      return cb({ id, jsonrpc, result: { nativeCurrency, erc20 } })
    } catch (e) {
      return resError({ message: (e as Error).message, code: 5901 }, payload, cb)
    }
  }

  sendAsync(payload: RPCRequestPayload, cb: Callback<RPCResponsePayload>) {
    let settled = false
    Promise.resolve(
      this.send(payload, (res) => {
        if (settled) {
          return
        }
        settled = true
        if (res.error) {
          const errMessage = res.error.message || `sendAsync error did not have message`
          cb(new Error(errMessage))
        } else {
          cb(null, res)
        }
      })
    ).catch((error: unknown) => {
      log.error('Could not send asynchronous provider request', error)
      if (settled) {
        return
      }
      settled = true
      cb(error instanceof Error ? error : new Error(String(error)))
    })
  }

  send(
    payload: RPCRequestPayload,
    respond: RPCRequestCallback = () => {},
    source?: RequestSource,
    context?: TransactionRequestContext
  ): void | Promise<void> {
    if (!context) {
      return this.dispatchRpc(payload, respond, source)
    }
    return createRpcGateway({
      origins: this.rpcOrigins,
      selectedAddresses: () => this.accounts.getSelectedAddresses(),
      handle: (input, reply, admitted) => this.handleRpc(input, reply, admitted, context)
    })(payload, respond, source)
  }

  private handleRpc(
    requestPayload: RPCRequestPayload,
    res: RPCRequestCallback = () => {},
    principal?: RequestSource,
    context?: TransactionRequestContext
  ) {
    const payload = requestPayload

    const method = payload.method || ''
    if (principal?.kind === 'agent') {
      if (method === 'eth_sendTransaction') {
        return this.sendAgentTransaction(payload as RPC.SendTransaction.Request, principal, res)
      }
      if (method === 'personal_sign') {
        return this.sendAgentPersonalSign(payload, principal, res)
      }
      if (method === 'wallet_getAssets') {
        return this.getAgentAssets(payload as RPC.GetAssets.Request, principal, res)
      }
      return this.sendAgentTypedData(payload as RPC.SignTypedData.Request, principal, res)
    }

    if (method === 'eth_sign' || method === 'eth_signTransaction') {
      return resError(
        { message: `${method} is not supported; use personal_sign or eth_sendTransaction`, code: 4200 },
        payload,
        res
      )
    }

    // method handlers that are not chain-specific can go here, before parsing the target chain
    if (method === 'eth_unsubscribe' && this.ifSubRemove(payload.params[0] as string)) {
      return res({ id: payload.id, jsonrpc: '2.0', result: true })
    } // Subscription was ours

    if (method === 'frame_getOriginStatus') {
      return this.getOriginStatus(payload, res, principal)
    }
    if (method === 'frame_disconnectOrigin') {
      return this.disconnectOrigin(payload, res, principal)
    }

    const targetChain = this.parseTargetChain(payload)

    if (!targetChain) {
      log.warn('received request with unknown chain', JSON.stringify(payload))
      return resError({ message: `unknown chain: ${payload.chainId}`, code: 4901 }, payload, res)
    }

    const getAccounts = (payload: JSONRPCRequestPayload, res: RPCRequestCallback) => {
      res({
        id: payload.id,
        jsonrpc: payload.jsonrpc,
        result: (this.accountFor(principal)?.getSelectedAddresses() ?? []).map((a) => a.toLowerCase())
      })
    }

    if (method === 'eth_sendRawTransaction') {
      return this.protectedOperations.submitRawTransaction(payload, res, targetChain)
    }

    if (method === 'eth_accounts') {
      return getAccounts(payload, res)
    }
    if (method === 'eth_requestAccounts') {
      return getAccounts(payload, res)
    }
    const requirePrincipal = () => {
      if (principal) {
        return principal
      }
      resError({ message: 'Wallet action is missing a trusted request source', code: 4100 }, payload, res)
    }

    if (method === 'eth_sendTransaction') {
      const trustedPrincipal = requirePrincipal()
      if (trustedPrincipal) {
        return this.sendTransaction(
          payload as RPC.SendTransaction.Request,
          res,
          targetChain,
          trustedPrincipal,
          context
        )
      }
      return
    }
    if (method === 'eth_getTransactionByHash') {
      return this.getTransactionByHash(payload, res, targetChain)
    }
    if (method === 'personal_ecRecover') {
      return ecRecover(payload, res)
    }
    if (method === 'web3_clientVersion') {
      return this.clientVersion(payload, res)
    }
    if (method === 'eth_subscribe' && (payload.params[0] as PropertyKey) in this.subscriptions) {
      return this.subscribe(payload as RPC.Subscribe.Request, res, principal)
    }

    if (method === 'personal_sign') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this._personalSign(payload, res, trustedPrincipal, targetChain.id) : undefined
    }

    if (
      ['eth_signTypedData', 'eth_signTypedData_v1', 'eth_signTypedData_v3', 'eth_signTypedData_v4'].includes(
        method
      )
    ) {
      const underscoreIndex = method.lastIndexOf('_')
      const version = (
        underscoreIndex > 3 ? method.substring(underscoreIndex + 1).toUpperCase() : undefined
      ) as SignTypedDataVersion
      const trustedPrincipal = requirePrincipal()
      if (trustedPrincipal) {
        return this.signTypedData(
          payload as RPC.SignTypedData.Request,
          version,
          res,
          trustedPrincipal,
          targetChain.id
        )
      }
      return
    }

    if (method === 'wallet_addEthereumChain') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this.addEthereumChain(payload, res, trustedPrincipal) : undefined
    }
    if (method === 'wallet_switchEthereumChain') {
      return this.switchEthereumChain(payload, res)
    }
    if (method === 'wallet_getPermissions') {
      return getPermissions(payload, res)
    }
    if (method === 'wallet_requestPermissions') {
      return requestPermissions(payload, res)
    }
    if (method === 'wallet_watchAsset') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this.addCustomToken(payload, res, targetChain, trustedPrincipal) : undefined
    }
    if (method === 'wallet_getEthereumChains') {
      return this.getChains(payload, res)
    }
    if (method === 'wallet_getAssets') {
      return this.getAssets(payload as RPC.GetAssets.Request, this.accountFor(principal), res)
    }

    // Connection dependent methods need to pass targetChain
    if (method === 'net_version') {
      return this.getNetVersion(payload, res, targetChain)
    }
    if (method === 'eth_chainId') {
      return this.getChainId(payload, res, targetChain)
    }

    // remove custom data
    const { _origin, chainId, ...rpcPayload } = payload

    if (rpcMethodPolicy(method)?.route !== 'chain') {
      return resError({ code: -32601, message: 'Method not found' }, payload, res)
    }
    // Only explicitly registered chain methods can reach the upstream connection.
    this.connection.send(rpcPayload, res, targetChain)
  }

  override emit(type: string | symbol, ...args: unknown[]) {
    return super.emit(type, ...args)
  }
}
