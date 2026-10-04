import crypto from 'crypto'

import { recoverTypedSignature } from '@metamask/eth-sig-util'
import log from 'electron-log'

import type { Chain, Chains } from '../../../features/chains/main/index.ts'
import type { AccountRequestPort } from '../../../features/connections/main/provider/accountRequestPort.ts'
import {
  feeTotalOverMax,
  getSignedAddress,
  resError,
  encodePersonalSignMessage
} from '../../../features/connections/main/provider/helpers.ts'
import type {
  AccountRequest,
  TransactionRequest,
  SignTypedDataRequest,
  TypedMessage
} from '../../../features/requests/contract/requests.ts'
import { isSignatureRequest } from '../../../features/requests/domain/index.ts'
import {
  applyTransactionAdjustments,
  type TransactionApprovalAdjustments
} from '../../../features/transactions/domain/approval.ts'
import type { TransactionData } from '../../../features/transactions/domain/index.ts'
import { maxFee } from '../../../features/transactions/main/index.ts'
import type {
  SigningApprovalContext,
  SigningUiContext
} from '../../../platform/signing/signers/Signer/index.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Callback } from '../../../shared/domain/async.ts'
import type { RPCRequestCallback, RPCRequestPayload } from '../../../shared/domain/rpc.ts'
import { isAiSessionActive, type AiSessionClientSource } from '../gateway/requestSource.ts'
import { exportProtectedPrivateKey } from './secrets.ts'
type AccountHandle = NonNullable<ReturnType<AccountRequestPort['getFrameAccount']>>
const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Sole owner of signing and transaction submission after operation approval or AI-session admission. */
export class ProtectedOperationsService {
  constructor(
    private readonly accounts: AccountRequestPort,
    private readonly connection: Pick<Chains, 'send'>,
    private readonly store: CanonicalStoreReader,
    private readonly getNonce: (data: TransactionData, respond: RPCRequestCallback) => void,
    private readonly exportSecret?: (address: string) => Promise<{ type: string; value: string }>
  ) {}

  async exportPrivateKey(accountId: string): Promise<string | undefined> {
    if (!this.exportSecret) {
      throw new Error('Private key export is unavailable')
    }
    return exportProtectedPrivateKey(accountId, {
      snapshot: () => this.store.getState().main,
      exportSecret: this.exportSecret
    })
  }

  submitRawTransaction(payload: RPCRequestPayload, respond: RPCRequestCallback, chain: Chain) {
    this.connection.send(
      { id: payload.id, jsonrpc: payload.jsonrpc, method: 'eth_sendRawTransaction', params: payload.params },
      respond,
      chain
    )
  }

  private requireActiveAiSession(
    source: AiSessionClientSource,
    payload: RPCRequestPayload,
    respond: RPCRequestCallback
  ) {
    if (isAiSessionActive(source)) {
      return true
    }
    resError('AI session is revoked or unavailable', payload, respond)
    return false
  }
  private aiSessionAccount(
    source: AiSessionClientSource,
    requestedAccount: unknown,
    payload: RPCRequestPayload,
    respond: RPCRequestCallback
  ) {
    if (!this.requireActiveAiSession(source, payload, respond)) {
      return
    }
    const permittedAccount = source.aiSession.accountId
    if (typeof requestedAccount !== 'string' || requestedAccount.toLowerCase() !== permittedAccount) {
      resError('AI session is not authorized for this account', payload, respond)
      return
    }
    const account = this.accounts.getFrameAccount(permittedAccount)
    if (!account || account.id.toLowerCase() !== permittedAccount) {
      resError('AI session account is unavailable', payload, respond)
      return
    }
    return account
  }

  private aiSessionAccountIsActive(source: AiSessionClientSource, account: AccountHandle) {
    return (
      isAiSessionActive(source) &&
      account.id.toLowerCase() === source.aiSession.accountId &&
      this.accounts.getFrameAccount(source.aiSession.accountId) === account
    )
  }

  private requireAiSessionAccount(
    source: AiSessionClientSource,
    account: AccountHandle,
    payload: RPCRequestPayload,
    respond: RPCRequestCallback
  ) {
    if (!this.requireActiveAiSession(source, payload, respond)) {
      return false
    }
    if (this.aiSessionAccountIsActive(source, account)) {
      return true
    }
    resError('AI session account is unavailable', payload, respond)
    return false
  }

  verifySignature(signed: string, message: string, address: string, cb: Callback<boolean>) {
    getSignedAddress(signed, message, (err, verifiedAddress) => {
      if (err) {
        return cb(err)
      }
      if ((verifiedAddress ?? '').toLowerCase() !== address.toLowerCase()) {
        return cb(new Error('Newframe verifySignature: Failed ecRecover check'))
      }
      cb(null, true)
    })
  }

  private signingApproval(request: AccountRequest, ui?: SigningUiContext): SigningApprovalContext {
    const accountId = request.account.toLowerCase()
    const requestId = request.requestId
    const identity = (value: AccountRequest) =>
      JSON.stringify(
        [
          value.requestId,
          value.type,
          value.account.toLowerCase(),
          value.payload,
          'data' in value ? value.data : undefined,
          'typedMessage' in value ? value.typedMessage : undefined,
          value.authorization
        ],
        (_key, item: unknown) => (typeof item === 'function' ? undefined : item)
      )
    const expected = identity(request)
    const typed = 'typedMessage' in request ? (request as SignTypedDataRequest).typedMessage : undefined
    const origin = this.store.getState().main.origins[request.origin] as { chain: { id: number } } | undefined
    let chainIdValue: unknown = isSignatureRequest(request) ? request.chainId : (origin?.chain.id ?? 1)
    if (request.type === 'transaction') {
      chainIdValue = (request as TransactionRequest).data.chainId
    } else if (typed && !Array.isArray(typed.data)) {
      chainIdValue = typed.data.domain.chainId ?? chainIdValue
    }
    const chainId = Number(chainIdValue)
    return {
      requestId,
      chainId,
      ...(ui ? { ui } : {}),
      isActive: () => {
        const main = this.store.getState().main
        const canonical = main.accounts[accountId]?.requests[requestId] as AccountRequest | undefined
        return (
          main.currentAccount === accountId &&
          canonical?.status === 'pending' &&
          canonical.authorization?.decision === 'prompt' &&
          identity(canonical) === expected
        )
      }
    }
  }

  approveSign(req: AccountRequest, cb: Callback<string>, context?: SigningUiContext) {
    const [addressValue, rawMessageValue] = arrayValue(req.payload.params)
    const address = typeof addressValue === 'string' ? addressValue : ''
    const rawMessage = typeof rawMessageValue === 'string' ? rawMessageValue : ''
    const message = encodePersonalSignMessage(rawMessage)

    this.accounts.signMessage(
      address,
      message,
      (err, signed) => {
        if (err) {
          cb(err, undefined)
        } else {
          const signature = signed ?? ''
          this.verifySignature(signature, message, address, (err) => {
            if (err) {
              cb(err)
            } else {
              cb(null, signature)
            }
          })
        }
      },
      this.signingApproval(req, context)
    )
  }

  approveSignTypedData(req: SignTypedDataRequest, cb: Callback<string>, context?: SigningUiContext) {
    const typedMessage = structuredClone(req.typedMessage)
    const addressValue: unknown = req.payload.params[0]
    if (typeof addressValue !== 'string') {
      return cb(new Error('TypedData request missing address'))
    }
    const address = addressValue

    this.accounts.signTypedData(
      address,
      typedMessage,
      (err, signature = '') => {
        if (err) {
          cb(err)
        } else {
          try {
            const recoveredAddress = recoverTypedSignature({ ...typedMessage, signature })
            if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
              throw new Error('TypedData signature verification failed')
            }

            cb(null, signature)
          } catch (e) {
            const err = e as Error
            cb(err)
          }
        }
      },
      this.signingApproval(req, context)
    )
  }

  private sendRawTransaction(
    signedTransaction: string | undefined,
    chainId: string,
    payload: Pick<RPCRequestPayload, 'id' | 'jsonrpc'>,
    respond: RPCRequestCallback
  ) {
    this.connection.send(
      {
        id: payload.id,
        jsonrpc: payload.jsonrpc,
        method: 'eth_sendRawTransaction',
        params: [signedTransaction]
      },
      respond,
      { type: 'ethereum', id: parseInt(chainId, 16) }
    )
  }

  signAndSend(req: TransactionRequest, cb: Callback<string>, context?: SigningUiContext) {
    const rawTx = structuredClone(req.data)
    const maxTotalFee = maxFee(rawTx)

    if (feeTotalOverMax(rawTx, maxTotalFee)) {
      const chainId = parseInt(rawTx.chainId)
      const symbol = this.store.getState().main.chains.ethereum[chainId]?.symbol
      const displayAmount = symbol ? ` (${Math.floor(maxTotalFee / 1e18)} ${symbol})` : ''

      const err = `Max fee is over hard limit${displayAmount}`

      cb(new Error(err))
    } else {
      this.accounts.signTransaction(
        rawTx,
        (err, signedTx) => {
          // Sign Transaction
          if (err) {
            cb(err)
          } else {
            this.accounts.setTxSigned(req.requestId, (err) => {
              if (err) {
                return cb(err)
              }
              let done = false
              const cast = () => {
                this.sendRawTransaction(signedTx, req.data.chainId, req.payload, (response) => {
                  clearInterval(broadcastTimer)
                  if (done) {
                    return
                  }
                  done = true
                  if (response.error) {
                    cb(Object.assign(new Error(response.error.message), { code: response.error.code }))
                  } else {
                    cb(null, response.result as string)
                  }
                })
              }
              const broadcastTimer = setInterval(() => cast(), 1000)
              cast()
            })
          }
        },
        this.signingApproval(req, context)
      )
    }
  }

  approveTransactionRequest(req: TransactionRequest, cb: Callback<string>, context?: SigningUiContext) {
    const signAndSend = (requestToSign: TransactionRequest) => {
      log.info('approveRequest', requestToSign)

      this.signAndSend(requestToSign, cb, context)
    }

    this.accounts.lockRequest(req.requestId)

    if (req.data.nonce) {
      return signAndSend(req)
    }

    this.getNonce(req.data, (response) => {
      if (response.error) {
        return cb(Object.assign(new Error(response.error.message), { code: response.error.code }))
      }

      const updatedReq = this.accounts.updateNonce(req.requestId, response.result as string)

      if (updatedReq) {
        signAndSend(updatedReq)
      } else {
        log.error(`could not find request with requestId="${req.requestId}"`)
        cb(new Error('could not find request'))
      }
    })
  }

  async executeAccountTransaction(
    accountId: string,
    reviewed: TransactionData,
    adjustments: TransactionApprovalAdjustments | undefined,
    context: SigningUiContext,
    requestId: string
  ): Promise<string> {
    const normalizedId = accountId.toLowerCase()
    const account = this.accounts.getFrameAccount(normalizedId)
    if (
      !account ||
      account.id !== normalizedId ||
      this.accounts.get(normalizedId)?.safe ||
      reviewed.from?.toLowerCase() !== normalizedId
    ) {
      throw new Error('Executor account is unavailable or does not match the reviewed transaction.')
    }
    const candidate = adjustments ? applyTransactionAdjustments(reviewed, adjustments) : reviewed
    const currentNonce = await new Promise<string>((resolve, reject) => {
      this.getNonce(candidate, (response) => {
        if (response.error || typeof response.result !== 'string') {
          reject(new Error(response.error?.message ?? 'Could not revalidate executor nonce.'))
        } else {
          resolve(response.result)
        }
      })
    })
    if (BigInt(currentNonce) !== BigInt(candidate.nonce ?? '0x0')) {
      throw new Error('Executor nonce changed. Prepare and review the transaction again.')
    }
    const maxTotalFee = maxFee(candidate)
    if (feeTotalOverMax(candidate, maxTotalFee)) {
      throw new Error('Max fee is over hard limit')
    }
    const signed = await new Promise<string>((resolve, reject) => {
      account.signTransaction(
        structuredClone(candidate),
        (error, value) => {
          if (error || !value) {
            reject(error ?? new Error('Executor returned no signed transaction.'))
          } else {
            resolve(value)
          }
        },
        {
          requestId,
          chainId: parseInt(candidate.chainId, 16),
          signal: undefined,
          isActive: () => context.isOwnerActive(),
          ui: context
        }
      )
    })
    return new Promise<string>((resolve, reject) => {
      this.sendRawTransaction(
        signed,
        candidate.chainId,
        { id: crypto.randomUUID(), jsonrpc: '2.0' },
        (response) => {
          if (response.error || typeof response.result !== 'string') {
            reject(
              Object.assign(new Error(response.error?.message ?? 'Executor broadcast failed.'), {
                code: response.error?.code
              })
            )
          } else {
            resolve(response.result)
          }
        }
      )
    })
  }

  executeAiSessionTransaction(
    request: TransactionRequest,
    requestSource: AiSessionClientSource,
    res: RPCRequestCallback
  ) {
    const account = this.aiSessionAccount(requestSource, request.account, request.payload, res)
    if (!account) {
      return
    }
    if (request.data.from?.toLowerCase() !== requestSource.aiSession.accountId) {
      resError('AI session is not authorized for the transaction account', request.payload, res)
      return
    }
    const signAndBroadcast = (data: TransactionData) => {
      if (!this.requireAiSessionAccount(requestSource, account, request.payload, res)) {
        return
      }

      const maxTotalFee = maxFee(data)
      if (feeTotalOverMax(data, maxTotalFee)) {
        return resError('Max fee is over hard limit', request.payload, res)
      }

      account.signTransaction(
        data,
        (signingError, signedTransaction) => {
          if (!this.requireAiSessionAccount(requestSource, account, request.payload, res)) {
            return
          }
          if (signingError || !signedTransaction) {
            return resError(signingError ?? 'AI session transaction signing failed', request.payload, res)
          }

          this.sendRawTransaction(signedTransaction, data.chainId, request.payload, (response) => {
            if (!response.error && typeof response.result === 'string') {
              const trackedRequest = { ...request, data }
              this.accounts.trackAutonomousTransaction(account.id, trackedRequest, response.result)
            }
            res(response)
          })
        },
        {
          requestId: request.requestId,
          chainId: parseInt(data.chainId, 16),
          isActive: () => this.aiSessionAccountIsActive(requestSource, account)
        }
      )
    }

    if (request.data.nonce) {
      return signAndBroadcast(request.data)
    }

    this.getNonce(request.data, (response) => {
      if (response.error || typeof response.result !== 'string') {
        return resError(response.error ?? 'Could not determine transaction nonce', request.payload, res)
      }
      signAndBroadcast({ ...request.data, nonce: response.result })
    })
  }

  signAiSessionMessage(
    message: string,
    normalizedPayload: RPCRequestPayload,
    requestSource: AiSessionClientSource,
    respond: RPCRequestCallback
  ) {
    const account = this.aiSessionAccount(
      requestSource,
      arrayValue(normalizedPayload.params)[0],
      normalizedPayload,
      respond
    )
    if (!account) {
      return
    }

    account.signMessage(
      message,
      (signingError, signed) => {
        if (!this.requireAiSessionAccount(requestSource, account, normalizedPayload, respond)) {
          return
        }
        if (signingError || !signed) {
          return resError(signingError ?? 'AI session message signing failed', normalizedPayload, respond)
        }

        this.verifySignature(signed, message, account.id, (verificationError) => {
          if (verificationError) {
            return resError(verificationError, normalizedPayload, respond)
          }
          if (!this.requireAiSessionAccount(requestSource, account, normalizedPayload, respond)) {
            return
          }
          respond({ id: normalizedPayload.id, jsonrpc: normalizedPayload.jsonrpc, result: signed })
        })
      },
      {
        requestId: String(normalizedPayload.id),
        chainId: 1,
        isActive: () => this.aiSessionAccountIsActive(requestSource, account)
      }
    )
  }
  signAiSessionTypedData(
    typedMessage: TypedMessage,
    payload: RPCRequestPayload,
    requestSource: AiSessionClientSource,
    respond: RPCRequestCallback
  ) {
    const account = this.aiSessionAccount(requestSource, arrayValue(payload.params)[0], payload, respond)
    if (!account) {
      return
    }

    account.signTypedData(
      typedMessage,
      (signingError, signature = '') => {
        if (!this.requireAiSessionAccount(requestSource, account, payload, respond)) {
          return
        }
        if (signingError || !signature) {
          return resError(signingError ?? 'AI session typed-data signing failed', payload, respond)
        }

        try {
          const recoveredAddress = recoverTypedSignature({ ...typedMessage, signature })
          if (recoveredAddress.toLowerCase() !== account.id) {
            throw new Error('TypedData signature verification failed')
          }
          respond({ id: payload.id, jsonrpc: payload.jsonrpc, result: signature })
        } catch (error) {
          resError(error as Error, payload, respond)
        }
      },
      {
        requestId: String(payload.id),
        chainId: 1,
        isActive: () => this.aiSessionAccountIsActive(requestSource, account)
      }
    )
  }
}
