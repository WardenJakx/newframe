import EventEmitter from 'events'
import crypto from 'crypto'
import log from 'electron-log'
import { v4 as uuid } from 'uuid'
import { estimateL1GasCost } from '../chains/l1GasFees'
import { recoverTypedSignature, SignTypedDataVersion } from '@metamask/eth-sig-util'
import { isAddress } from 'ethers'
import { addHexPrefix, intToHex, isHexString, fromUtf8 } from '@ethereumjs/util'
import { shallow } from 'zustand/shallow'

import store from '../store'
import packageFile from '../../package.json'

import proxyConnection from './proxy'
import accounts, {
  AccountRequest,
  TransactionRequest,
  SignTypedDataRequest,
  AddChainRequest,
  AddTokenRequest
} from '../accounts'

import FrameAccount from '../accounts/Account'
import Chains, { Chain } from '../chains'
import reveal from '../reveal'
import { getSignerType, Type as SignerType } from '../../resources/domain/signer'
import { toTokenId } from '../../resources/domain/token'
import { normalizeChainId, TransactionData } from '../../resources/domain/transaction'
import { populate as populateTransaction, maxFee, classifyTransaction } from '../transaction'
import { capitalize, isNonZeroHex } from '../../resources/utils'
import { ApprovalType } from '../../resources/constants'
import { createObserver as AssetsObserver, loadAssets } from './assets'
import { getVersionFromTypedData } from './typedData'
import { getCalldataDigest, getEip712Digests } from '../signatures/digests'

import { Subscription, SubscriptionType, hasSubscriptionPermission } from './subscriptions'
import {
  checkExistingNonceGas,
  ecRecover,
  feeTotalOverMax,
  gasFees,
  getPermissions,
  getRawTx,
  getSignedAddress,
  requestPermissions,
  resError,
  decodeMessage
} from './helpers'

import {
  createChainsObserver as ChainsObserver,
  createOriginChainObserver as OriginChainObserver,
  getActiveChains
} from './chains'
import {
  EIP2612TypedData,
  LegacyTypedData,
  PermitSignatureRequest,
  SignatureRequest,
  TypedData,
  TypedMessage
} from '../accounts/types'
import * as sigParser from '../signatures'
import { hasAddress } from '../../resources/domain/account'
import { mapRequest } from '../requests'
import {
  createMainPrincipal,
  hasPrincipalCapability,
  type AgentPrincipal,
  type TrustedPrincipal
} from '../authority'

import type { Origin, Permission } from '../store/state'

const signTypedDataV4OnlySignerTypes: SignerType[] = [SignerType.Ledger, SignerType.Trezor]
const proxyPrincipal = createMainPrincipal('provider-proxy', ['wallet:internal-state'])

interface RequiredApproval {
  type: ApprovalType
  data: any
}

interface TransactionMetadata {
  tx: TransactionData
  approvals: RequiredApproval[]
}

type ProviderSubscriptionType = SubscriptionType | 'chainChanged' | 'networkChanged'

const storeApi = {
  getOrigin: (id: string) => store.getState().main.origins[id] as Origin,
  getPermissions: (address: string) =>
    (store.getState().main.permissions[address] || {}) as Record<string, Permission>
}

const getPayloadOrigin = ({ _origin }: RPCRequestPayload) => storeApi.getOrigin(_origin)

class Provider extends EventEmitter {
  connected = false
  connection = Chains
  private storeUnsubscribes: Array<() => void> = []

  handlers: Record<string, RPCRequestCallback> = {}
  subscriptions: { [key in ProviderSubscriptionType]: Subscription[] } = {
    accountsChanged: [],
    assetsChanged: [],
    chainChanged: [],
    chainsChanged: [],
    networkChanged: []
  }

  constructor() {
    super()

    this.connection.on('connect', (...args) => {
      this.connected = true
      this.emit('connect', ...args)
    })

    this.connection.on('close', () => {
      this.connected = false
    })

    this.connection.on('data', (chain, ...args) => {
      if ((args[0] || {}).method === 'eth_subscription') {
        this.emit('data:subscription', ...args)
      }

      this.emit(`data:${chain.type}:${chain.id}`, ...args)
    })

    this.connection.on('error', (chain, err) => {
      log.error(err)
    })

    this.connection.on('update', (chain: Chain, event) => {
      if (event.type === 'status') {
        this.emit(`status:${chain.type}:${chain.id}`, event.status)
      }
    })

    proxyConnection.on('provider:send', (payload: RPCRequestPayload) => {
      const { id, method } = payload
      this.send(
        payload,
        ({ error, result }) => {
          proxyConnection.emit('payload', { id, method, error, result })
        },
        proxyPrincipal
      )
    })

    proxyConnection.on('provider:subscribe', (payload: RPC.Subscribe.Request) => {
      const subId = this.createSubscription(payload, proxyPrincipal)
      const { id, jsonrpc } = payload

      proxyConnection.emit('payload', { id, jsonrpc, result: subId })
    })

    this.getNonce = this.getNonce.bind(this)
    this.subscribeToStore()
  }

  private subscribeToStore() {
    const chainsObserver = ChainsObserver(this)
    const originChainObserver = OriginChainObserver(this)
    const assetsObserver = AssetsObserver(this)

    // Establish the origin baseline before listening so the first change is compared
    // against the state that existed when the provider was created.
    originChainObserver()

    this.storeUnsubscribes.push(
      store.subscribe(
        (state) => [state.main.networks.ethereum, state.main.networksMeta.ethereum] as const,
        chainsObserver,
        { equalityFn: shallow }
      ),
      store.subscribe((state) => state.main.origins, originChainObserver),
      store.subscribe(
        (state) =>
          [
            state.main.currentAccount,
            state.main.accounts,
            state.main.balances,
            state.main.networksMeta.ethereum,
            state.main.rates
          ] as const,
        assetsObserver,
        { equalityFn: shallow }
      )
    )
  }

  closeStoreSubscriptions() {
    this.storeUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe())
  }

  accountsChanged(accounts: string[]) {
    const address = accounts[0]

    this.subscriptions.accountsChanged
      .filter((subscription) => hasSubscriptionPermission(SubscriptionType.ACCOUNTS, address, subscription))
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, accounts))
  }

  assetsChanged(address: string, assets: RPC.GetAssets.Assets) {
    this.subscriptions.assetsChanged
      .filter((subscription) => hasSubscriptionPermission(SubscriptionType.ASSETS, address, subscription))
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
      .filter((subscription) => hasSubscriptionPermission('chainsChanged', address, subscription))
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, chains))
  }

  networkChanged(netId: number | string, originId: string) {
    this.subscriptions.networkChanged
      .filter((subscription) => subscription.originId === originId)
      .forEach((subscription) => this.sendSubscriptionData(subscription.id, netId))
  }

  private sendSubscriptionData(subscription: string, result: any) {
    const payload: RPC.Susbcription.Response = {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription, result }
    }

    proxyConnection.emit('payload', payload)
    this.emit('data:subscription', payload)
  }

  getNetVersion(payload: RPCRequestPayload, res: RPCRequestCallback, targetChain: Chain) {
    const chain = store.getState().main.networks.ethereum[targetChain.id]
    const response = chain?.on
      ? { result: targetChain.id }
      : { error: { message: 'not connected', code: -1 } }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, ...response })
  }

  getChainId(payload: RPCRequestPayload, res: RPCSuccessCallback, targetChain: Chain) {
    const chain = store.getState().main.networks.ethereum[targetChain.id]
    const response = chain?.on
      ? { result: intToHex(targetChain.id) }
      : { error: { message: 'not connected', code: -1 } }

    res({ id: payload.id, jsonrpc: payload.jsonrpc, ...response })
  }

  verifySignature(signed: string, message: string, address: string, cb: Callback<boolean>) {
    getSignedAddress(signed, message, (err, verifiedAddress) => {
      if (err) return cb(err)
      if ((verifiedAddress || '').toLowerCase() !== address.toLowerCase())
        return cb(new Error('Newframe verifySignature: Failed ecRecover check'))
      cb(null, true)
    })
  }

  approveSign(req: AccountRequest, cb: Callback<string>) {
    const res = this.requestResponder(req.handlerId)

    const payload = req.payload
    const [address, rawMessage] = payload.params

    let message = rawMessage

    if (isHexString(rawMessage)) {
      if (!rawMessage.startsWith('0x')) {
        message = addHexPrefix(rawMessage)
      }
    } else {
      message = fromUtf8(rawMessage)
    }

    accounts.signMessage(address, message, (err, signed) => {
      if (err) {
        resError(err.message, payload, res)
        cb(err, undefined)
      } else {
        const signature = signed || ''
        this.verifySignature(signature, message, address, (err) => {
          if (err) {
            resError(err.message, payload, res)
            cb(err)
          } else {
            res({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
            cb(null, signature)
          }
        })
      }
    })
  }

  approveSignTypedData(req: SignTypedDataRequest, cb: Callback<string>) {
    const res = this.requestResponder(req.handlerId)

    const { payload, typedMessage } = req
    const [address] = payload.params

    accounts.signTypedData(address, typedMessage, (err, signature = '') => {
      if (err) {
        resError(err.message, payload, res)
        cb(err)
      } else {
        try {
          const recoveredAddress = recoverTypedSignature({ ...typedMessage, signature })
          if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            throw new Error('TypedData signature verification failed')
          }

          res({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
          cb(null, signature)
        } catch (e) {
          const err = e as Error
          resError(err.message, payload, res)

          cb(err)
        }
      }
    })
  }

  async getL1GasCost(txData: TransactionData) {
    const { chainId, type, ...tx } = txData

    const txRequest = {
      ...tx,
      type: parseInt(type, 16),
      chainId: parseInt(chainId, 16)
    }

    const connection = this.connection.connections['ethereum'][txRequest.chainId] as any
    const connectedProvider = connection?.primary?.connected
      ? connection.primary?.provider
      : connection.secondary?.provider

    if (!connectedProvider) {
      return 0n
    }

    return estimateL1GasCost(connectedProvider, txRequest)
  }

  signAndSend(req: TransactionRequest, cb: Callback<string>) {
    const rawTx = req.data
    const res = this.requestResponder(req.handlerId)

    const payload = req.payload
    const maxTotalFee = maxFee(rawTx)

    if (feeTotalOverMax(rawTx, maxTotalFee)) {
      const chainId = parseInt(rawTx.chainId)
      const symbol = (store.getState().main.networks.ethereum[chainId] as any)?.symbol
      const displayAmount = symbol ? ` (${Math.floor(maxTotalFee / 1e18)} ${symbol})` : ''

      const err = `Max fee is over hard limit${displayAmount}`

      resError(err, payload, res)
      cb(new Error(err))
    } else {
      accounts.signTransaction(rawTx, (err, signedTx) => {
        // Sign Transaction
        if (err) {
          resError(err, payload, res)
          cb(err)
        } else {
          accounts.setTxSigned(req.handlerId, (err) => {
            if (err) return cb(err)
            let done = false
            const cast = () => {
              this.connection.send(
                {
                  id: req.payload.id,
                  jsonrpc: req.payload.jsonrpc,
                  method: 'eth_sendRawTransaction',
                  params: [signedTx]
                },
                (response) => {
                  clearInterval(broadcastTimer)
                  if (done) return
                  done = true
                  if (response.error) {
                    resError(response.error, payload, res)
                    cb(new Error(response.error.message))
                  } else {
                    res(response)
                    cb(null, response.result)
                  }
                },
                {
                  type: 'ethereum',
                  id: parseInt(req.data.chainId, 16)
                }
              )
            }
            const broadcastTimer = setInterval(() => cast(), 1000)
            cast()
          })
        }
      })
    }
  }

  approveTransactionRequest(req: TransactionRequest, cb: Callback<string>) {
    const signAndSend = (requestToSign: TransactionRequest) => {
      log.info('approveRequest', requestToSign)

      this.signAndSend(requestToSign, cb)
    }

    accounts.lockRequest(req.handlerId)

    if (req.data.nonce) return signAndSend(req)

    this.getNonce(req.data, (response) => {
      if (response.error) {
        this.respondToRequest(req.handlerId, response)

        return cb(new Error(response.error.message))
      }

      const updatedReq = accounts.updateNonce(req.handlerId, response.result)

      if (updatedReq) {
        signAndSend(updatedReq)
      } else {
        log.error(`could not find request with handlerId="${req.handlerId}"`)
        cb(new Error('could not find request'))
      }
    })
  }

  private addRequestHandler(res: RPCRequestCallback) {
    const handlerId: string = uuid()
    this.handlers[handlerId] = res

    return handlerId
  }

  private respondToRequest(handlerId: string, response: RPCResponsePayload) {
    const handler = this.handlers[handlerId]
    delete this.handlers[handlerId]
    handler?.(response)
  }

  private requestResponder(handlerId: string): RPCRequestCallback {
    return (response) => this.respondToRequest(handlerId, response)
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
            log.warn(`error estimating gas for tx to ${txParams.to}: ${response.error}`)
            return reject(response.error)
          }

          const estimatedLimit = parseInt(response.result, 16)
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
    if (!newTx) {
      return cb(new Error('No transaction data'))
    }

    const connection = this.connection.connections['ethereum'][parseInt(newTx.chainId, 16)]
    const chainConnected = connection && (connection.primary?.connected || connection.secondary?.connected)

    if (!chainConnected) {
      return cb(new Error(`Chain ${newTx.chainId} not connected`))
    }

    try {
      const approvals: RequiredApproval[] = []
      const rawTx = getRawTx(newTx)
      await this.connection.refreshGasFees({ type: 'ethereum', id: parseInt(rawTx.chainId, 16) })
      const gas = gasFees(rawTx)
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
        rawTx.to ? reveal.resolveEntityType(rawTx.to, parseInt(rawTx.chainId, 16)) : ''
      ])

      const tx = { ...rawTx, gasLimit, recipientType }

      try {
        const populatedTransaction = populateTransaction(tx, chainConfig, gas)
        const checkedTransaction = checkExistingNonceGas(populatedTransaction)

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

  sendAgentTransaction(
    payload: RPC.SendTransaction.Request,
    principal: AgentPrincipal,
    res: RPCRequestCallback
  ) {
    const account = accounts.getFrameAccount(principal.accountId)
    const txParams = payload.params?.[0]
    if (!account || !txParams || typeof txParams !== 'object') {
      return resError('Agent transaction is missing its authorized account or transaction', payload, res)
    }

    const payloadChainId = payload.chainId ? parseInt(payload.chainId, 16) : undefined
    const normalized = normalizeChainId(txParams, payloadChainId)
    const chainId = normalized.chainId || payload.chainId
    if (!chainId || Number.isNaN(parseInt(chainId, 16))) {
      return resError('Agent transaction requires a valid chainId', payload, res)
    }

    const from = (normalized.from || account.id).toLowerCase()
    if (from !== principal.accountId || from !== account.id) {
      return resError('Agent session is not authorized for the transaction account', payload, res)
    }

    this.fillTransaction({ ...normalized, from, chainId }, (error, transactionMetadata) => {
      if (error || !transactionMetadata)
        return resError(error || 'Could not prepare transaction', payload, res)
      if (transactionMetadata.approvals.length > 0) {
        return resError('Agent transaction requires an explicit user approval', payload, res)
      }

      const { feesUpdated: _feesUpdated, recipientType, ...data } = transactionMetadata.tx
      const handlerId = uuid()
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

      accounts.routeRequest(principal, request, res, (authorizedRequest) => {
        this.executeAgentTransaction(account, authorizedRequest as TransactionRequest, res)
      })
    })
  }

  sendAgentPersonalSign(payload: RPCRequestPayload, principal: AgentPrincipal, res: RPCRequestCallback) {
    const account = accounts.getFrameAccount(principal.accountId)
    const params = payload.params || []
    const orderedParams =
      isAddress(params[0]) && !isAddress(params[1]) ? [...params] : [params[1], params[0], ...params.slice(2)]
    const [requestedAddress, rawMessage] = orderedParams

    if (!account || typeof requestedAddress !== 'string' || typeof rawMessage !== 'string' || !rawMessage) {
      return resError('Agent sign request requires an authorized account and message', payload, res)
    }

    const address = requestedAddress.toLowerCase()
    if (address !== principal.accountId || address !== account.id) {
      return resError('Agent session is not authorized for the sign request account', payload, res)
    }

    let message = rawMessage
    if (isHexString(rawMessage)) {
      if (!rawMessage.startsWith('0x')) message = addHexPrefix(rawMessage)
    } else {
      message = fromUtf8(rawMessage)
    }

    const normalizedPayload = { ...payload, params: [account.id, message, ...orderedParams.slice(2)] }
    const request: SignatureRequest = {
      handlerId: uuid(),
      type: 'sign',
      payload: normalizedPayload,
      account: account.id,
      origin: 'newframe-agent',
      data: { decodedMessage: decodeMessage(message) }
    }

    accounts.routeRequest(principal, request, res, () => {
      account.signMessage(message, (signingError, signed) => {
        if (signingError || !signed) {
          return resError(signingError || 'Agent message signing failed', normalizedPayload, res)
        }

        this.verifySignature(signed, message, account.id, (verificationError) => {
          if (verificationError) return resError(verificationError, normalizedPayload, res)
          res({ id: normalizedPayload.id, jsonrpc: normalizedPayload.jsonrpc, result: signed })
        })
      })
    })
  }

  sendAgentTypedData(
    rawPayload: RPC.SignTypedData.Request,
    principal: AgentPrincipal,
    res: RPCRequestCallback
  ) {
    const account = accounts.getFrameAccount(principal.accountId)
    const orderedParams =
      isAddress(rawPayload.params[1]) && !isAddress(rawPayload.params[0])
        ? [rawPayload.params[1], rawPayload.params[0], ...rawPayload.params.slice(2)]
        : [...rawPayload.params]
    const [requestedAddress, rawTypedData, ...additionalParams] = orderedParams

    if (!account || typeof requestedAddress !== 'string' || !rawTypedData) {
      return resError('Agent typed-data request requires an authorized account and data', rawPayload, res)
    }

    const address = requestedAddress.toLowerCase()
    if (address !== principal.accountId || address !== account.id) {
      return resError('Agent session is not authorized for the typed-data account', rawPayload, res)
    }

    let typedData = rawTypedData
    if (typeof typedData === 'string') {
      try {
        typedData = JSON.parse(typedData) as LegacyTypedData | TypedData
      } catch {
        return resError('Malformed typed data', rawPayload, res)
      }
    }

    if (!typedData || typeof typedData !== 'object' || Array.isArray(typedData) || !typedData.message) {
      return resError('Typed data missing message', rawPayload, res)
    }

    const explicitVersion = rawPayload.method.endsWith('_v3')
      ? SignTypedDataVersion.V3
      : rawPayload.method.endsWith('_v4')
        ? SignTypedDataVersion.V4
        : undefined
    const version = explicitVersion || getVersionFromTypedData(typedData)
    if (![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(version)) {
      return resError('Agent typed-data signing supports only v3 and v4', rawPayload, res)
    }

    const payload = {
      ...rawPayload,
      params: [account.id, typedData, ...additionalParams]
    } as RPC.SignTypedData.Request
    const typedMessage: TypedMessage = { data: typedData, version }
    const digests = getEip712Digests(typedMessage)
    const request: SignTypedDataRequest = {
      handlerId: uuid(),
      type: 'signTypedData',
      typedMessage,
      ...(digests ? { digests } : {}),
      payload,
      account: account.id,
      origin: 'newframe-agent'
    }

    accounts.routeRequest(principal, request, res, () => {
      account.signTypedData(typedMessage, (signingError, signature = '') => {
        if (signingError || !signature) {
          return resError(signingError || 'Agent typed-data signing failed', payload, res)
        }

        try {
          const recoveredAddress = recoverTypedSignature({ ...typedMessage, signature })
          if (recoveredAddress.toLowerCase() !== account.id) {
            throw new Error('TypedData signature verification failed')
          }
          res({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
        } catch (error) {
          resError(error as Error, payload, res)
        }
      })
    })
  }

  private executeAgentTransaction(
    account: FrameAccount,
    request: TransactionRequest,
    res: RPCRequestCallback
  ) {
    const signAndBroadcast = (data: TransactionData) => {
      const maxTotalFee = maxFee(data)
      if (feeTotalOverMax(data, maxTotalFee)) {
        return resError('Max fee is over hard limit', request.payload, res)
      }

      account.signTransaction(data, (signingError, signedTransaction) => {
        if (signingError || !signedTransaction) {
          return resError(signingError || 'Agent transaction signing failed', request.payload, res)
        }

        this.connection.send(
          {
            id: request.payload.id,
            jsonrpc: request.payload.jsonrpc,
            method: 'eth_sendRawTransaction',
            params: [signedTransaction]
          },
          (response) => {
            if (!response.error && typeof response.result === 'string') {
              const trackedRequest = { ...request, data }
              accounts.trackAutonomousTransaction(account.id, trackedRequest, response.result)
            }
            res(response)
          },
          { type: 'ethereum', id: parseInt(data.chainId, 16) }
        )
      })
    }

    if (request.data.nonce) return signAndBroadcast(request.data)

    this.getNonce(request.data, (response) => {
      if (response.error || typeof response.result !== 'string') {
        return resError(response.error || 'Could not determine transaction nonce', request.payload, res)
      }
      signAndBroadcast({ ...request.data, nonce: response.result })
    })
  }

  sendTransaction(
    payload: RPC.SendTransaction.Request,
    res: RPCRequestCallback,
    targetChain: Chain,
    principal: TrustedPrincipal
  ) {
    try {
      const txParams = payload.params[0]
      const payloadChain = payload.chainId

      const normalizedTx = normalizeChainId(txParams, payloadChain ? parseInt(payloadChain, 16) : undefined)
      const tx = {
        ...normalizedTx,
        chainId: normalizedTx.chainId || payloadChain || addHexPrefix(targetChain.id.toString(16))
      }

      const currentAccount = accounts.current()

      log.verbose(`sendTransaction(${JSON.stringify(tx)}`)

      const from = tx.from || (currentAccount && currentAccount.id)

      if (!currentAccount || !from || !hasAddress(currentAccount, from)) {
        const accountId = (tx.from || '').toLowerCase()

        if (accountId && accounts.get(accountId)) {
          return accounts.setSigner(accountId, (err) => {
            if (err) return resError(err, payload, res)
            this.sendTransaction(payload, res, targetChain, principal)
          })
        }

        return resError('Transaction is not from currently selected account', payload, res)
      }

      this.fillTransaction({ ...tx, from }, (err, transactionMetadata) => {
        if (err) {
          resError(err, payload, res)
        } else {
          const handlerId = this.addRequestHandler(res)
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
            account: (currentAccount as FrameAccount).id,
            origin: payload._origin,
            approvals: txMetadata.approvals.map(({ type, data }) => ({
              type,
              data,
              approved: false
            })),
            feesUpdatedByUser: false,
            recipientType,
            recognizedActions: []
          } as Omit<TransactionRequest, 'classification'>

          const classification = classifyTransaction(unclassifiedReq)

          const req = {
            ...unclassifiedReq,
            classification
          }

          accounts.routeRequest(principal, req, this.requestResponder(handlerId))
        }
      })
    } catch (e) {
      resError((e as Error).message, payload, res)
    }
  }

  getTransactionByHash(payload: RPCRequestPayload, cb: RPCRequestCallback, targetChain: Chain) {
    const res = (response: any) => {
      if (response.result && !response.result.gasPrice && response.result.maxFeePerGas) {
        return cb({ ...response, result: { ...response.result, gasPrice: response.result.maxFeePerGas } })
      }

      cb(response)
    }

    this.connection.send(payload, res, targetChain)
  }

  _personalSign(payload: RPCRequestPayload, res: RPCRequestCallback, principal: TrustedPrincipal) {
    const params = payload.params || []

    if (isAddress(params[0]) && !isAddress(params[1])) {
      // personal_sign requests expect the first parameter to be the message and the second
      // parameter to be an address. however some clients send these in the opposite order
      // so try to detect that
      return this.sign(payload, res, principal)
    }

    // switch the order of params to be consistent with eth_sign
    return this.sign({ ...payload, params: [params[1], params[0], ...params.slice(2)] }, res, principal)
  }

  sign(payload: RPCRequestPayload, res: RPCRequestCallback, principal: TrustedPrincipal) {
    const [from, message] = payload.params || []
    const currentAccount = accounts.current()

    if (!message) {
      return resError('Sign request requires a message param', payload, res)
    }

    if (!currentAccount || !hasAddress(currentAccount, from)) {
      return resError('Sign request is not from currently selected account', payload, res)
    }

    const handlerId = this.addRequestHandler(res)

    const req = {
      handlerId,
      type: 'sign',
      payload,
      account: (currentAccount as FrameAccount).getAccounts()[0],
      origin: payload._origin,
      data: {
        decodedMessage: decodeMessage(message)
      }
    } as SignatureRequest

    accounts.routeRequest(principal, req, this.requestResponder(handlerId))
  }

  signTypedData(
    rawPayload: RPC.SignTypedData.Request,
    version: SignTypedDataVersion,
    res: RPCCallback<RPC.SignTypedData.Response>,
    principal: TrustedPrincipal
  ) {
    // ensure param order is [address, data, ...] regardless of version
    const orderedParams =
      isAddress(rawPayload.params[1]) && !isAddress(rawPayload.params[0])
        ? [rawPayload.params[1], rawPayload.params[0], ...rawPayload.params.slice(2)]
        : [...rawPayload.params]

    const payload = {
      ...rawPayload,
      params: orderedParams
    }

    const [from = '', rawTypedData, ...additionalParams] = payload.params
    let typedData = rawTypedData

    if (!typedData) {
      return resError(`Missing typed data`, payload, res)
    }

    // HACK: Standards clearly say, that second param is an object but it seems like in the wild it can be a JSON-string.
    if (typeof typedData === 'string') {
      try {
        typedData = JSON.parse(typedData) as LegacyTypedData | TypedData
        payload.params = [from, typedData, ...additionalParams]
      } catch (e) {
        return resError('Malformed typed data', payload, res)
      }
    }

    if (!Array.isArray(typedData) && !typedData.message) {
      return resError('Typed data missing message', payload, res)
    }

    // no explicit version called so we choose one which best fits the data
    if (!version) {
      version = getVersionFromTypedData(typedData)
    }

    const targetAccount = accounts.get(from.toLowerCase())

    if (!targetAccount) {
      return resError(`Unknown account: ${from}`, payload, res)
    }

    const currentAccount = accounts.current()
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

    const handlerId = this.addRequestHandler(res)
    const typedMessage: TypedMessage<typeof version> = {
      data: typedData,
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

      accounts.routeRequest(principal, permitRequest, this.requestResponder(handlerId))
    } else {
      accounts.routeRequest(principal, req, this.requestResponder(handlerId))
    }
  }

  subscribe(payload: RPC.Subscribe.Request, res: RPCSuccessCallback, principal?: TrustedPrincipal) {
    log.debug('provider subscribe', { payload })

    const subId = this.createSubscription(payload, principal)

    res({ id: payload.id, jsonrpc: '2.0', result: subId })
  }

  private createSubscription(payload: RPC.Subscribe.Request, principal?: TrustedPrincipal) {
    const subId = addHexPrefix(crypto.randomBytes(16).toString('hex'))
    const subscriptionType = payload.params[0] as ProviderSubscriptionType

    this.subscriptions[subscriptionType] = this.subscriptions[subscriptionType] || []
    this.subscriptions[subscriptionType].push({
      id: subId,
      originId: payload._origin,
      capabilities:
        principal && (principal.kind === 'rpc' || principal.kind === 'main') ? principal.capabilities : []
    })

    return subId
  }

  ifSubRemove(id: string) {
    return Object.keys(this.subscriptions).some((type) => {
      const subscriptionType = type as ProviderSubscriptionType
      const index = this.subscriptions[subscriptionType].findIndex((sub) => sub.id === id)

      return index > -1 && this.subscriptions[subscriptionType].splice(index, 1)
    })
  }

  clientVersion(payload: RPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: '2.0', result: `Newframe/v${packageFile.version}` })
  }

  private getOriginConnection(payload: RPCRequestPayload) {
    const originId = payload._origin
    const origin = storeApi.getOrigin(originId)
    const currentAccount = accounts.current() as any
    const rawAddress = currentAccount?.address || currentAccount?.id || ''
    const address = rawAddress ? rawAddress.toLowerCase() : ''
    const permissionAddresses = Array.from(
      new Set([rawAddress, address].filter(Boolean).map((candidate) => candidate.toString()))
    )

    let permissionAddress = ''
    let permissionId = ''
    let permission: Permission | undefined

    for (const candidate of permissionAddresses) {
      const permissions = storeApi.getPermissions(candidate)
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

    const chainId = origin?.chain?.id ? intToHex(origin.chain.id) : undefined

    return {
      originId,
      originName: origin?.name || '',
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

  private getOriginStatus(payload: RPCRequestPayload, res: RPCSuccessCallback, principal?: TrustedPrincipal) {
    const { originId, originName, address, connected, chainId } = this.getOriginConnection(payload)
    const selectedAddress = hasPrincipalCapability(principal, 'wallet:internal-state') ? address : ''

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

  private disconnectOrigin(payload: RPCRequestPayload, res: RPCSuccessCallback) {
    const { originId, originName, address, permissionAddress, permissionId, chainId } =
      this.getOriginConnection(payload)

    if (permissionAddress && permissionId) {
      store.getState().revokePermission(permissionAddress, permissionId)
    }

    if (address) {
      accounts.clearRequestsByOrigin(address, originId)
    }

    store.getState().endOriginSession(originId)
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
      if (!params || !params[0]) throw new Error('Params not supplied')

      const requestedChainId = params[0].chainId
      if (typeof requestedChainId !== 'string' || !/^0x[0-9a-f]+$/i.test(requestedChainId)) {
        throw new Error('Invalid chain id')
      }
      const chainId = Number(BigInt(requestedChainId))
      if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Invalid chain id')

      // Check if chain exists
      const exists = Boolean(store.getState().main.networks.ethereum[chainId]?.on)
      if (!exists) {
        const err: EVMError = { message: 'Chain does not exist', code: 4902 }
        return resError(err, payload, res)
      }

      const originId = payload._origin
      const origin = getPayloadOrigin(payload)
      if (origin.chain.id !== chainId) {
        store.getState().switchOriginChain(originId, chainId, origin.chain.type)
      }

      return res({ id: payload.id, jsonrpc: '2.0', result: null })
    } catch (e) {
      return resError(e as EVMError, payload, res)
    }
  }

  private addEthereumChain(payload: RPCRequestPayload, res: RPCRequestCallback, principal: TrustedPrincipal) {
    if (!payload.params[0]) return resError('addChain request missing params', payload, res)

    const type = 'ethereum'
    const { chainId, chainName, nativeCurrency, rpcUrls = [], blockExplorerUrls = [] } = payload.params[0]

    if (!chainId) return resError('addChain request missing chainId', payload, res)
    if (typeof chainId !== 'string' || !/^0x[0-9a-f]+$/i.test(chainId)) {
      return resError('Invalid chain id', payload, res)
    }

    const id = Number(BigInt(chainId))
    if (!Number.isSafeInteger(id) || id <= 0) return resError('Invalid chain id', payload, res)

    const existing = store.getState().main.networks[type][id]
    if (existing?.on) return this.switchEthereumChain(payload, res)

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
        !nativeCurrency ||
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

    const handlerId = this.addRequestHandler(res)
    const metadata = store.getState().main.networksMeta[type][id]
    const requestChain = existing
      ? {
          id,
          type,
          name: existing.name,
          symbol: metadata?.nativeCurrency.symbol || existing.symbol || '',
          explorer: existing.explorer
        }
      : {
          type,
          id,
          name: chainName.trim(),
          symbol: nativeCurrency.symbol,
          primaryRpc: rpcUrls[0],
          secondaryRpc: rpcUrls[1],
          explorer: blockExplorerUrls[0] || '',
          nativeCurrencyName: nativeCurrency.name
        }
    accounts.routeRequest(
      principal,
      {
        handlerId,
        type: 'addChain',
        chain: requestChain,
        account: (accounts.getAccounts() || [])[0],
        origin: payload._origin,
        payload
      } as AddChainRequest,
      this.requestResponder(handlerId)
    )
  }

  private addCustomToken(
    payload: RPCRequestPayload,
    cb: RPCRequestCallback,
    targetChain: Chain,
    principal: TrustedPrincipal
  ) {
    const { type, options: tokenData } = (payload.params || {}) as any

    if ((type || '').toLowerCase() !== 'erc20') {
      return resError('only ERC-20 tokens are supported', payload, cb)
    }

    this.getChainId(
      payload,
      (resp: RPCResponsePayload) => {
        if (resp.error) {
          return resError(resp.error, payload, cb)
        }

        const chainId = parseInt(resp.result)
        const address = (tokenData.address || '').toLowerCase()
        const symbol = (tokenData.symbol || '').toUpperCase()
        const decimals = parseInt(tokenData.decimals || '1')

        if (!address) {
          return resError('tokens must define an address', payload, cb)
        }

        const res: RPCRequestCallback = (response) => {
          if (response?.error) return cb(response)
          cb({ id: payload.id, jsonrpc: '2.0', result: true })
        }

        // don't attempt to add the token if it's already been added
        const tokenExists = store.getState().main.tokens.byId[toTokenId({ chainId, address })]?.custom
        if (tokenExists) {
          return res({ id: payload.id, jsonrpc: '2.0', result: true })
        }

        const token = {
          chainId,
          name: tokenData.name || capitalize(symbol),
          address,
          symbol,
          decimals,
          logoURI: tokenData.image || tokenData.logoURI || ''
        }

        const handlerId = this.addRequestHandler(res)

        accounts.routeRequest(
          principal,
          {
            handlerId,
            type: 'addToken',
            token,
            account: (accounts.current() as FrameAccount).id,
            origin: payload._origin,
            payload
          } as AddTokenRequest,
          this.requestResponder(handlerId)
        )
      },
      targetChain
    )
  }

  private parseTargetChain(payload: RPCRequestPayload): Chain {
    if ('chainId' in payload) {
      const chainId = parseInt(payload.chainId || '', 16)
      const chainConnection = this.connection.connections['ethereum'][chainId] || {}

      return chainConnection.chainConfig && { type: 'ethereum', id: chainId }
    }

    return getPayloadOrigin(payload).chain
  }

  private getChains(payload: JSONRPCRequestPayload, res: RPCSuccessCallback) {
    res({ id: payload.id, jsonrpc: payload.jsonrpc, result: getActiveChains() })
  }

  private getAssets(
    payload: RPC.GetAssets.Request,
    currentAccount: FrameAccount | null,
    cb: RPCCallback<RPC.GetAssets.Response>
  ) {
    if (!currentAccount) return resError('no account selected', payload, cb)

    try {
      const { nativeCurrency, erc20 } = loadAssets(currentAccount.id)
      const { id, jsonrpc } = payload

      return cb({ id, jsonrpc, result: { nativeCurrency, erc20 } })
    } catch (e) {
      return resError({ message: (e as Error).message, code: 5901 }, payload, cb)
    }
  }

  sendAsync(payload: RPCRequestPayload, cb: Callback<RPCResponsePayload>) {
    this.send(payload, (res) => {
      if (res.error) {
        const errMessage = res.error.message || `sendAsync error did not have message`
        cb(new Error(errMessage))
      } else {
        cb(null, res)
      }
    })
  }

  send(requestPayload: RPCRequestPayload, res: RPCRequestCallback = () => {}, principal?: TrustedPrincipal) {
    // TODO: in the future this mapping will happen in the requests module so that the handler only ever
    // has to worry about one shape of request, error handling for each request type will happen
    // in the request handler for each type of request
    let payload: RPCRequestPayload

    try {
      payload = mapRequest(requestPayload)
    } catch (e) {
      return resError({ message: (e as Error).message }, requestPayload, res)
    }

    const method = payload.method || ''

    // method handlers that are not chain-specific can go here, before parsing the target chain
    if (method === 'eth_unsubscribe' && this.ifSubRemove(payload.params[0]))
      return res({ id: payload.id, jsonrpc: '2.0', result: true }) // Subscription was ours

    if (method === 'frame_getOriginStatus') return this.getOriginStatus(payload, res, principal)
    if (method === 'frame_disconnectOrigin') return this.disconnectOrigin(payload, res)

    const targetChain = this.parseTargetChain(payload)

    if (!targetChain) {
      log.warn('received request with unknown chain', JSON.stringify(payload))
      return resError({ message: `unknown chain: ${payload.chainId}`, code: 4901 }, payload, res)
    }

    function getAccounts(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
      res({
        id: payload.id,
        jsonrpc: payload.jsonrpc,
        result: accounts.getSelectedAddresses().map((a) => a.toLowerCase())
      })
    }

    function getCoinbase(payload: RPCRequestPayload, res: RPCRequestCallback) {
      accounts.getAccounts((err, accounts) => {
        if (err) return resError(`signTransaction Error: ${JSON.stringify(err)}`, payload, res)
        res({ id: payload.id, jsonrpc: payload.jsonrpc, result: (accounts || [])[0] })
      })
    }

    if (method === 'eth_coinbase') return getCoinbase(payload, res)
    if (method === 'eth_accounts') return getAccounts(payload, res)
    if (method === 'eth_requestAccounts') return getAccounts(payload, res)
    const requirePrincipal = () => {
      if (principal) return principal
      resError({ message: 'Wallet action is missing a trusted request source', code: 4100 }, payload, res)
    }

    if (method === 'eth_sendTransaction') {
      const trustedPrincipal = requirePrincipal()
      if (trustedPrincipal)
        return this.sendTransaction(
          payload as RPC.SendTransaction.Request,
          res,
          targetChain,
          trustedPrincipal
        )
      return
    }
    if (method === 'eth_getTransactionByHash') return this.getTransactionByHash(payload, res, targetChain)
    if (method === 'personal_ecRecover') return ecRecover(payload, res)
    if (method === 'web3_clientVersion') return this.clientVersion(payload, res)
    if (method === 'eth_subscribe' && payload.params[0] in this.subscriptions) {
      return this.subscribe(payload as RPC.Subscribe.Request, res, principal)
    }

    if (method === 'personal_sign') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this._personalSign(payload, res, trustedPrincipal) : undefined
    }
    if (method === 'eth_sign') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this.sign(payload, res, trustedPrincipal) : undefined
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
      if (trustedPrincipal)
        return this.signTypedData(
          payload as RPC.SignTypedData.Request,
          version,
          res as RPCCallback<RPC.SignTypedData.Response>,
          trustedPrincipal
        )
      return
    }

    if (method === 'wallet_addEthereumChain') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this.addEthereumChain(payload, res, trustedPrincipal) : undefined
    }
    if (method === 'wallet_switchEthereumChain') return this.switchEthereumChain(payload, res)
    if (method === 'wallet_getPermissions') return getPermissions(payload, res)
    if (method === 'wallet_requestPermissions') return requestPermissions(payload, res)
    if (method === 'wallet_watchAsset') {
      const trustedPrincipal = requirePrincipal()
      return trustedPrincipal ? this.addCustomToken(payload, res, targetChain, trustedPrincipal) : undefined
    }
    if (method === 'wallet_getEthereumChains') return this.getChains(payload, res)
    if (method === 'wallet_getAssets')
      return this.getAssets(
        payload as RPC.GetAssets.Request,
        accounts.current(),
        res as RPCCallback<RPC.GetAssets.Response>
      )

    // Connection dependent methods need to pass targetChain
    if (method === 'net_version') return this.getNetVersion(payload, res, targetChain)
    if (method === 'eth_chainId') return this.getChainId(payload, res, targetChain)

    // remove custom data
    const { _origin, chainId, ...rpcPayload } = payload

    // Pass everything else to our connection
    this.connection.send(rpcPayload, res, targetChain)
  }

  override emit(type: string | symbol, ...args: any[]) {
    return super.emit(type, ...args)
  }
}

const provider = new Provider()

export default provider
