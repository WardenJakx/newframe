import { randomUUID } from 'node:crypto'

import type {
  NetworkRequestResolveCommand,
  TransactionReplaceCommand
} from '../../../app/contracts/operations.js'
import {
  findUnavailableSigners,
  isHardwareSigner,
  isSignerReady
} from '../../../platform/signing/domain/index.js'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer/index.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { Chain } from '../../../platform/state-store/state/index.js'
import { toBigInt } from '../../../shared/domain/units.js'
import type { TrustedPrincipal } from '../../access-control/main/authority.js'
import type { Accounts } from '../../accounts/main/index.js'
import type { SafeMessageApprovalResult } from '../../accounts/main/safeMessage.js'
import type { SafeTransactionPort } from '../../accounts/main/safeTransactionPort.js'
import { deriveSigningCapability } from '../../accounts/main/signingCapability.js'
import { resolveAssetRate } from '../../asset-data/domain/asset/index.js'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants.js'
import {
  applyTransactionAdjustments,
  type TransactionApprovalAdjustments
} from '../../transactions/domain/approval.js'
import { usesBaseFee } from '../../transactions/domain/index.js'
import type { AccountTransactionPolicyPort } from '../../transactions/main/accountPolicyPort.js'
import type {
  AccountRequest,
  AccessRequest,
  AddChainRequest,
  AddTokenRequest,
  RequestApprovalGate,
  SignatureRequest,
  SignTypedDataRequest,
  TransactionRequest
} from '../contract/requests.js'
import { ReplacementType } from '../contract/requests.js'
import type { ApprovalType } from '../domain/approval.js'
import { isSignatureRequest, isTransactionRequest, isTypedMessageSignatureRequest } from '../domain/index.js'

const FEE_WARNING_THRESHOLD_USD = 50

const editable = (request: AccountRequest) =>
  !request.status && (!isTransactionRequest(request) || (!request.locked && request.mode !== 'monitor'))

type Continuation = {
  respond: RPCRequestCallback
  request?: Pick<AccountRequest, 'account' | 'handlerId' | 'payload'> & { safeTxHash?: string }
}

export interface PromptedRequestContinuationPort {
  bind(request: AccountRequest): void
  create(respond: RPCRequestCallback, requestId?: string): string
  respond(requestId: string, response: RPCResponsePayload): boolean
}

export interface PromptedRequestLifecyclePort extends PromptedRequestContinuationPort {
  reject(request: AccountRequest, error: EVMError): boolean
  resolve(request: AccountRequest, result?: unknown): boolean
}

type RequestAccount = NonNullable<ReturnType<Accounts['getFrameAccount']>>

export interface RequestServicePorts {
  accounts: Pick<
    Accounts,
    | 'clearRequestsByOrigin'
    | 'get'
    | 'getFrameAccount'
    | 'replaceTx'
    | 'setRequestError'
    | 'setRequestPending'
    | 'setRequestSuccess'
    | 'setTxSent'
  > & {
    trackSafeExecution?(safeTxHash: string, outerTxHash: string): boolean
  }
  agent: {
    resolveAccess(requestId: string, approved: boolean): boolean
  }
  clock: {
    delay(ms: number): Promise<void>
  }
  network: {
    rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
  }
  provider: {
    approveSign(request: AccountRequest, context?: SigningUiContext): Promise<string>
    approveSignTypedData(request: SignTypedDataRequest, context?: SigningUiContext): Promise<string>
    approveTransactionRequest(request: TransactionRequest, context?: SigningUiContext): Promise<string>
  }
  safeMessages?: {
    approve(
      request: SignatureRequest,
      ownerId: string,
      context: SigningUiContext
    ): Promise<SafeMessageApprovalResult>
  }
  safeTransactions?: SafeTransactionPort
  store: CanonicalStoreReader
  transactionPolicy: Pick<AccountTransactionPolicyPort, 'signerCompatibility'>
  vault: { exists(): boolean; isUnlocked(): boolean }
}

function displayUSD(usd: number) {
  return (Math.ceil(usd * 100) / 100).toFixed(2)
}

function rpcError(request: AccountRequest, error: EVMError): RPCResponsePayload {
  return {
    id: request.payload.id,
    jsonrpc: request.payload.jsonrpc,
    error
  }
}

function rpcSuccess(request: AccountRequest, result?: unknown): RPCResponsePayload {
  return {
    id: request.payload.id,
    jsonrpc: request.payload.jsonrpc,
    result
  }
}

function normalizedError(error: unknown): EVMError {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown }
    return {
      code: typeof candidate.code === 'number' ? candidate.code : -1,
      message: typeof candidate.message === 'string' ? candidate.message : 'Request failed'
    }
  }
  return { code: -1, message: typeof error === 'string' ? error : 'Request failed' }
}

export function createRequestService(ports: RequestServicePorts) {
  const continuations = new Map<string, Continuation>()
  const safeContinuations = new Map<string, string>()
  const submittedSafeTransactions = new Set<string>()
  const approvalsInFlight = new Set<string>()
  const approvalKey = (requestId: string, ownerId?: string) =>
    ownerId ? `${requestId}:${ownerId.toLowerCase()}` : requestId
  const clearApprovalKeys = (requestId: string) => {
    for (const key of approvalsInFlight) {
      if (key === requestId || key.startsWith(`${requestId}:`)) {
        approvalsInFlight.delete(key)
      }
    }
  }

  const removeUnsignedSafeDraft = (request: AccountRequest) => {
    if (!isTransactionRequest(request) || !request.safeTxHash || !ports.safeTransactions) {
      return
    }
    try {
      ports.safeTransactions.removeUnsigned({
        type: 'safe.confirmation-status',
        accountId: request.account,
        chainId: Number.parseInt(request.data.chainId, 16),
        safeTxHash: request.safeTxHash,
        ownerId: request.account
      })
    } catch {
      // The proposal may already have been removed or replaced. Rejection is
      // still authoritative for the RPC continuation.
    }
  }

  const locate = <T extends AccountRequest = AccountRequest>(requestId: string) => {
    const accountState = Object.values(ports.store.getState().main.accounts).find(
      (account) => account.requests[requestId]
    )
    if (!accountState) {
      return
    }
    const account = ports.accounts.getFrameAccount(accountState.id)
    const request = account?.getRequest<T>(requestId)
    return account && request ? { account, request } : undefined
  }

  const setGate = (account: RequestAccount, requestId: string, gate?: RequestApprovalGate) => {
    account.patchRequest(requestId, (request) => {
      if (gate) {
        request.approvalGate = gate
      } else {
        delete request.approvalGate
      }
    })
  }

  const settle = (requestId: string, response: RPCResponsePayload) => {
    const continuation = continuations.get(requestId)
    if (!continuation) {
      return false
    }
    continuations.delete(requestId)
    if (continuation.request && 'safeTxHash' in continuation.request) {
      const safeTxHash = (continuation.request as Pick<TransactionRequest, 'safeTxHash'>).safeTxHash
      if (safeTxHash && safeContinuations.get(safeTxHash.toLowerCase()) === requestId) {
        safeContinuations.delete(safeTxHash.toLowerCase())
      }
    }
    continuation.respond(response)
    return true
  }

  const failApproval = (request: AccountRequest, error: unknown, key = request.handlerId) => {
    approvalsInFlight.delete(key)
    if (normalizedError(error).code === 4001) {
      const account = ports.accounts.getFrameAccount(request.account)
      if (account?.getRequest(request.handlerId)) {
        account.rejectRequest(request, normalizedError(error))
        return
      }
    }
    if (!settle(request.handlerId, rpcError(request, normalizedError(error)))) {
      return
    }
    ports.accounts.setRequestError(
      request.handlerId,
      error instanceof Error ? error : new Error(String(error))
    )
  }

  const completeApproval = (request: AccountRequest, result: unknown, key = request.handlerId) => {
    approvalsInFlight.delete(key)
    if (!settle(request.handlerId, rpcSuccess(request, result))) {
      return
    }
    if (isTransactionRequest(request)) {
      ports.accounts.setTxSent(request.handlerId, result as string)
    } else {
      ports.accounts.setRequestSuccess(request.handlerId)
    }
  }

  const signerGate = (
    account: RequestAccount,
    request: AccountRequest,
    confirmed: ReadonlySet<RequestApprovalGate['type']>
  ): RequestApprovalGate | undefined => {
    if (isTransactionRequest(request) && request.safeTxHash) {
      // Safe owner/executor authority is selected explicitly and validated by
      // the Safe coordinator, never inferred from the Safe account signer.
      return
    }
    if (isSignatureRequest(request)) {
      const main = ports.store.getState().main
      const capability = deriveSigningCapability(
        request,
        Object.values(main.accounts),
        main.signers,
        main.appLock,
        main.currentProfile
      )
      if (capability.status === 'ready') {
        return
      }
      const attached = capability.candidates.filter((candidate) => candidate.signerAttached)
      return attached.length
        ? {
            type: 'signer-compatibility',
            reason: 'signer-unavailable',
            signerIds: attached.map((candidate) => candidate.accountId)
          }
        : { type: 'signer-compatibility', reason: 'no-signer' }
    }
    const signerSummaries = ports.store.getState().main.signers
    const sparseSignerSummaries = signerSummaries as Record<
      string,
      (typeof signerSummaries)[string] | undefined
    >
    const signer = account.signer ? sparseSignerSummaries[account.signer] : undefined
    if (!signer) {
      const unavailable = findUnavailableSigners(account.lastSignerType, Object.values(signerSummaries))
      return unavailable.length
        ? {
            type: 'signer-compatibility',
            reason: 'signer-unavailable',
            signerIds: unavailable.map(({ id }) => id)
          }
        : { type: 'signer-compatibility', reason: 'no-signer' }
    }

    if (!isSignerReady(signer)) {
      return isHardwareSigner(signer)
        ? { type: 'signer-compatibility', reason: 'signer-unavailable', signerIds: [signer.id] }
        : undefined
    }

    if (!isTransactionRequest(request)) {
      return
    }
    const compatibility = ports.transactionPolicy.signerCompatibility(request.data, signer)
    if (
      !compatibility.compatible &&
      !ports.store.getState().main.mute.signerCompatibilityWarning &&
      !confirmed.has('signer-compatibility')
    ) {
      return {
        type: 'signer-compatibility',
        reason: 'incompatible',
        signer: compatibility.signer,
        tx: compatibility.tx,
        chain: { type: 'ethereum', id: parseInt(request.data.chainId, 16) }
      }
    }
  }

  const gasFeeGate = (
    request: TransactionRequest,
    confirmed: ReadonlySet<RequestApprovalGate['type']>
  ): RequestApprovalGate | undefined => {
    if (request.safeTxHash) {
      // The reviewed outer executor transaction owns gas and fee policy.
      return
    }
    const state = ports.store.getState().main
    if (state.mute.gasFeeWarning || confirmed.has('gas-fee')) {
      return
    }

    const chainId = parseInt(request.data.chainId, 16)
    const networks = state.networks.ethereum as Record<
      number,
      (typeof state.networks.ethereum)[number] | undefined
    >
    const metadata = state.networksMeta.ethereum as Record<
      number,
      (typeof state.networksMeta.ethereum)[number] | undefined
    >
    const network = networks[chainId]
    const nativeCurrency = metadata[chainId]?.nativeCurrency
    const currentSymbol = nativeCurrency?.symbol ?? '?'
    const nativeUSD = !network?.isTestnet
      ? resolveAssetRate(
          { chainId, address: NATIVE_CURRENCY, nativeTicker: nativeCurrency?.symbol },
          state.assetRates
        )?.usdRate
      : undefined
    if (typeof nativeUSD !== 'number') {
      return
    }

    const gasLimit = toBigInt(request.data.gasLimit) ?? 0n
    const maxFeePerGas =
      toBigInt(usesBaseFee(request.data) ? request.data.maxFeePerGas : request.data.gasPrice) ?? 0n
    const feeUSD = displayUSD((Number(maxFeePerGas * gasLimit) / 1e18) * nativeUSD)
    if (Number(feeUSD) <= FEE_WARNING_THRESHOLD_USD && feeUSD !== '0.00') {
      return
    }

    return { type: 'gas-fee', feeUSD, currentSymbol }
  }

  const executeApproval = (
    account: RequestAccount,
    request: AccountRequest,
    context?: SigningUiContext,
    ownerId?: string,
    executorId?: string,
    adjustments?: TransactionApprovalAdjustments
  ) => {
    const selectedId = ownerId ?? executorId
    const key = approvalKey(request.handlerId, selectedId)
    if (approvalsInFlight.has(key)) {
      return true
    }

    if (isTransactionRequest(request) && request.safeTxHash) {
      if (!context || !ports.safeTransactions || (!ownerId && !executorId) || (ownerId && executorId)) {
        return false
      }
      const identity = {
        accountId: request.account,
        chainId: Number.parseInt(request.data.chainId, 16),
        safeTxHash: request.safeTxHash
      }
      if (ownerId) {
        const accepted = ports.safeTransactions.approve(
          {
            type: 'request.approve',
            operationId: `${request.handlerId}:${ownerId}:${randomUUID()}`,
            ...identity,
            ownerId
          },
          context
        )
        if (accepted) {
          setGate(account, request.handlerId)
          ports.accounts.setRequestPending(request)
        }
        return accepted
      }
      setGate(account, request.handlerId)
      ports.accounts.setRequestPending(request)
      approvalsInFlight.add(key)
      void ports.safeTransactions
        .execute(
          identity,
          executorId!,
          adjustments,
          context,
          `${request.handlerId}:${executorId}:execute:${randomUUID()}`
        )
        .then(
          () => approvalsInFlight.delete(key),
          () => approvalsInFlight.delete(key)
        )
      return true
    }

    approvalsInFlight.add(key)
    setGate(account, request.handlerId)
    ports.accounts.setRequestPending(request)

    const continuation = continuations.get(request.handlerId)
    const initialState = ports.store.getState()
    const initialAccounts = initialState.main.accounts as Record<
      string,
      (typeof initialState.main.accounts)[string] | undefined
    >
    const created = initialAccounts[request.account]?.created
    const actionId = request.authorization?.actionId
    const complete = (settleApproval: () => void) => {
      if (continuations.get(request.handlerId) !== continuation) {
        return
      }
      const currentState = ports.store.getState()
      const currentAccounts = currentState.main.accounts as Record<
        string,
        (typeof currentState.main.accounts)[string] | undefined
      >
      const currentAccount = currentAccounts[request.account]
      const currentRequest = currentAccount?.requests[request.handlerId] as AccountRequest | undefined
      if (currentAccount?.created !== created || currentRequest?.authorization?.actionId !== actionId) {
        approvalsInFlight.delete(key)
        settle(
          request.handlerId,
          rpcError(request, { code: 4001, message: 'Signing approval is no longer active' })
        )
        return
      }
      settleApproval()
    }

    const approveRequest = () => {
      if (isSignatureRequest(request)) {
        const main = ports.store.getState().main
        const capability = deriveSigningCapability(
          request,
          Object.values(main.accounts),
          main.signers,
          main.appLock,
          main.currentProfile
        )
        if (capability.type === 'safe') {
          if (!ownerId || !context) {
            throw new Error('Select an available Safe owner before approving.')
          }
          if (
            !capability.candidates.some(
              (candidate) =>
                candidate.accountId.toLowerCase() === ownerId.toLowerCase() && candidate.status === 'ready'
            )
          ) {
            throw new Error('Selected Safe owner is not ready or authorized for this request.')
          }
          if (!ports.safeMessages) {
            throw new Error('Safe message signing is unavailable.')
          }
          return ports.safeMessages.approve(request, ownerId, context)
        }
      }
      if (isTransactionRequest(request)) {
        return ports.provider.approveTransactionRequest(request, context)
      }
      if (request.type === 'sign') {
        return ports.provider.approveSign(request, context)
      }
      if (isTypedMessageSignatureRequest(request)) {
        return ports.provider.approveSignTypedData(request, context)
      }
      return undefined
    }
    let approval: ReturnType<typeof approveRequest>
    try {
      approval = approveRequest()
    } catch (error) {
      failApproval(request, error, key)
      return true
    }
    void approval?.then(
      (result) => {
        approvalsInFlight.delete(key)
        complete(() => {
          if (typeof result === 'object' && 'status' in result) {
            if (result.status === 'pending') {
              return
            }
            completeApproval(request, result.signature, key)
            return
          }
          completeApproval(request, result, key)
        })
      },
      (error: unknown) => {
        approvalsInFlight.delete(key)
        complete(() => failApproval(request, error, key))
      }
    )
    return true
  }

  const advanceApproval = (
    account: RequestAccount,
    request: AccountRequest,
    confirmed: ReadonlySet<RequestApprovalGate['type']>,
    context?: SigningUiContext,
    ownerId?: string,
    executorId?: string,
    adjustments?: TransactionApprovalAdjustments
  ) => {
    const nextSignerGate = signerGate(account, request, confirmed)
    if (nextSignerGate) {
      setGate(account, request.handlerId, nextSignerGate)
      return true
    }
    if (isTransactionRequest(request)) {
      const nextGasGate = gasFeeGate(request, confirmed)
      if (nextGasGate) {
        setGate(account, request.handlerId, nextGasGate)
        return true
      }
    }
    return executeApproval(account, request, context, ownerId, executorId, adjustments)
  }

  const service = {
    bind(request: AccountRequest) {
      const continuation = continuations.get(request.handlerId)
      if (continuation) {
        continuation.request = request
        if (isTransactionRequest(request) && request.safeTxHash) {
          safeContinuations.set(request.safeTxHash.toLowerCase(), request.handlerId)
        }
      }
    },

    cancel(requestId: string) {
      const cancelled = continuations.delete(requestId)
      if (cancelled) {
        const located = locate(requestId)
        located?.account.rejectRequest(located.request, { code: 4001, message: 'Request cancelled' })
        clearApprovalKeys(requestId)
      }
      return cancelled
    },

    create(respond: RPCRequestCallback, requestId: string = randomUUID()) {
      if (continuations.has(requestId)) {
        throw new Error(`Request continuation already exists: ${requestId}`)
      }
      continuations.set(requestId, { respond })
      return requestId
    },

    respond: settle,

    resolve(request: AccountRequest, result?: unknown) {
      return settle(request.handlerId, rpcSuccess(request, result))
    },

    reject(request: AccountRequest, error: EVMError) {
      clearApprovalKeys(request.handlerId)
      removeUnsignedSafeDraft(request)
      return settle(request.handlerId, rpcError(request, error))
    },

    approve(
      requestId: string,
      context?: SigningUiContext,
      adjustments?: TransactionApprovalAdjustments,
      ownerId?: string,
      executorId?: string
    ) {
      const located = locate(requestId)
      if (!located || (!isTransactionRequest(located.request) && !isSignatureRequest(located.request))) {
        return false
      }
      if (located.request.authorization?.decision !== 'prompt') {
        return false
      }
      const safeTransaction = isTransactionRequest(located.request) && Boolean(located.request.safeTxHash)
      if (ownerId && executorId) {
        return false
      }
      if (
        adjustments !== undefined &&
        (!isTransactionRequest(located.request) ||
          (!safeTransaction && !editable(located.request)) ||
          (safeTransaction && !executorId) ||
          approvalsInFlight.has(requestId) ||
          !continuations.has(requestId) ||
          (ports.vault.exists() && !ports.vault.isUnlocked()))
      ) {
        return false
      }
      if (approvalsInFlight.has(approvalKey(requestId, ownerId ?? executorId))) {
        return true
      }
      // Canonical success/error UI can outlive the external requester briefly.
      // Once its continuation is settled, approving the same request again must
      // acknowledge without repeating signing or broadcast side effects.
      if (!continuations.has(requestId)) {
        return true
      }

      if (adjustments !== undefined && isTransactionRequest(located.request) && !safeTransaction) {
        const canonical = located.request.data
        const candidate = applyTransactionAdjustments(canonical, adjustments)
        const changed = Object.keys(adjustments).some((key) => {
          const field = key as keyof TransactionApprovalAdjustments
          return candidate[field] !== canonical[field]
        })
        const feeOverride = Object.keys(adjustments).some(
          (field) =>
            field !== 'nonce' && adjustments[field as keyof TransactionApprovalAdjustments] !== undefined
        )
        if (changed || feeOverride) {
          const updated = located.account.patchRequest<TransactionRequest>(requestId, (request) => {
            request.data = candidate
            if (feeOverride) {
              request.feesUpdatedByUser = true
              delete request.automaticFeeUpdateNotice
            }
            if (changed) {
              delete request.approvalGate
            }
          })
          if (!updated) {
            return false
          }
          located.request = updated
        }
      }
      const pendingGate = located.request.approvalGate
      if (
        pendingGate?.type === 'gas-fee' ||
        (pendingGate?.type === 'signer-compatibility' && pendingGate.reason === 'incompatible')
      ) {
        // Re-publish an unchanged gate so dismissing a local notification does not
        // strand the canonical approval flow on the next explicit approve attempt.
        setGate(located.account, requestId, { ...pendingGate })
        return true
      }
      if (ports.vault.exists() && !ports.vault.isUnlocked()) {
        ports.accounts.setRequestError(requestId, new Error('Newframe locked'))
        return true
      }
      const safePending =
        ((isSignatureRequest(located.request) && Boolean(ownerId)) ||
          (safeTransaction && Boolean(ownerId ?? executorId))) &&
        located.request.status === 'pending'
      if (!editable(located.request) && !safePending) {
        return false
      }
      return advanceApproval(
        located.account,
        located.request,
        new Set(),
        context,
        ownerId,
        executorId,
        adjustments
      )
    },

    confirmWarning(requestId: string, gate: RequestApprovalGate['type'], context?: SigningUiContext) {
      const located = locate(requestId)
      const pendingGate = located?.request.approvalGate
      if (!located || !pendingGate || pendingGate.type !== gate) {
        return false
      }
      if (
        (!isTransactionRequest(located.request) && !isSignatureRequest(located.request)) ||
        located.request.authorization?.decision !== 'prompt' ||
        !editable(located.request) ||
        !continuations.has(requestId) ||
        approvalsInFlight.has(requestId) ||
        (ports.vault.exists() && !ports.vault.isUnlocked())
      ) {
        return false
      }
      if (pendingGate.type === 'signer-compatibility' && pendingGate.reason !== 'incompatible') {
        return false
      }
      setGate(located.account, requestId)
      return advanceApproval(
        located.account,
        located.request,
        gate === 'gas-fee' ? new Set(['signer-compatibility', 'gas-fee']) : new Set([gate]),
        context
      )
    },

    rejectRequest(requestId: string) {
      const located = locate(requestId)
      if (!located) {
        return false
      }
      located.account.rejectRequest(located.request, {
        code: 4001,
        message: 'User rejected the request'
      })
      return true
    },

    notifySafeTransactionSubmitted(result: { safeTxHash: string; outerTxHash: string }) {
      const safeTxHash = result.safeTxHash.toLowerCase()
      if (submittedSafeTransactions.has(safeTxHash)) {
        return true
      }
      submittedSafeTransactions.add(safeTxHash)
      const requestId = safeContinuations.get(safeTxHash)
      const located = requestId ? locate<TransactionRequest>(requestId) : undefined
      if (located?.request.safeTxHash?.toLowerCase() === safeTxHash) {
        const main = ports.store.getState().main
        const account = main.accounts[located.request.account]
        const chainId = Number.parseInt(located.request.data.chainId, 16)
        const proposal = account.safe?.[String(chainId)]?.pending?.find(
          (candidate) => candidate.safeTxHash.toLowerCase() === safeTxHash
        )
        const executorId = proposal?.local?.execution.executorId
        located.account.patchRequest<TransactionRequest>(requestId!, (request) => {
          request.safeExecution = {
            ...(executorId ? { executorId } : {}),
            ...(proposal?.local?.execution.transaction
              ? { reviewedTransaction: proposal.local.execution.transaction }
              : {}),
            ...(executorId ? { submitted: { outerTxHash: result.outerTxHash, executorId } } : {})
          }
        })
        completeApproval(located.request, result.outerTxHash)
        return true
      }
      safeContinuations.delete(safeTxHash)
      return ports.accounts.trackSafeExecution?.(result.safeTxHash, result.outerTxHash) ?? false
    },

    resolveAccess(requestId: string, approved: boolean) {
      const located = locate<AccessRequest>(requestId)
      if (located?.request.type !== 'access') {
        return false
      }
      if (approved && located.request.payload.method === 'eth_requestAccounts') {
        const { main } = ports.store.getState()
        const accounts = main.accounts as Record<string, (typeof main.accounts)[string] | undefined>
        const selected = accounts[main.currentAccount]
        if (!selected || !ports.accounts.getFrameAccount(selected.address)) {
          located.account.setAccess(located.request, false)
          return true
        }
        located.account.setAccess(located.request, true, selected.address)
      } else {
        located.account.setAccess(located.request, approved)
      }
      return true
    },

    resolveAgentAccess(requestId: string, approved: boolean) {
      return ports.agent.resolveAccess(requestId, approved)
    },

    resolveSwitchChain(requestId: string, approved: boolean) {
      const located = locate(requestId)
      const request = located?.request as
        | (AccountRequest<'switchChain'> & { chain?: { id?: string | number; type?: string } })
        | undefined
      if (!located || request?.type !== 'switchChain') {
        return false
      }
      if (approved) {
        const state = ports.store.getState()
        const chainId = Number(request.chain?.id)
        const origins = state.main.origins as Record<string, (typeof state.main.origins)[string] | undefined>
        const networks = state.main.networks.ethereum as Record<
          number,
          (typeof state.main.networks.ethereum)[number] | undefined
        >
        if (
          request.chain?.type !== 'ethereum' ||
          !Number.isInteger(chainId) ||
          !origins[request.origin] ||
          !networks[chainId]
        ) {
          return false
        }
        state.switchOriginChain(request.origin, chainId, 'ethereum')
      }
      located.account.resolveRequest(request)
      return true
    },

    clearOrigin(accountId: string, originId: string) {
      const account = ports.accounts.get(accountId)
      if (!account) {
        return false
      }
      ports.accounts.clearRequestsByOrigin(accountId, originId)
      return true
    },

    confirmRequestApproval(requestId: string, approvalType: 'approveOtherChain' | 'approveGasLimit') {
      const located = locate<TransactionRequest>(requestId)
      if (located?.request.type !== 'transaction') {
        return false
      }
      const approval = located.request.approvals.find((candidate) => candidate.type === approvalType)
      if (!approval || approval.approved) {
        return false
      }
      return located.account.approveRequest(requestId, approvalType as ApprovalType, {})
    },

    reviewAddChain(requestId: string) {
      const located = locate<AddChainRequest>(requestId)
      if (located?.request.type !== 'addChain') {
        return false
      }
      ports.store.getState().navHome({
        view: 'addChain',
        data: { chain: located.request.chain, requestId: located.request.handlerId }
      })
      return true
    },

    reviewAddToken(requestId: string) {
      const located = locate<AddTokenRequest>(requestId)
      if (located?.request.type !== 'addToken') {
        return false
      }
      const { address, symbol, decimals, logoURI, name, chainId } = located.request.token
      located.account.resolveRequest(located.request, null)
      ports.store.getState().navHome({
        view: 'tokens',
        data: { token: { address, chainId, decimals, logoURI, name, symbol } }
      })
      return true
    },

    async resolveNetwork(command: NetworkRequestResolveCommand) {
      const state = ports.store.getState()
      const located = command.requestId ? locate<AddChainRequest>(command.requestId) : undefined
      const request = located?.request.type === 'addChain' ? located.request : undefined
      const currentHomeCommand = state.tray.homeCommand as {
        id: number
        data?: { chain?: Chain; newChain?: Chain }
      } | null
      const homeCommand = command.homeCommandId === currentHomeCommand?.id ? currentHomeCommand : undefined
      const chain = request?.chain ?? homeCommand?.data?.newChain ?? homeCommand?.data?.chain
      if (!chain) {
        return false
      }

      if (command.approved) {
        const chainId = Number(chain.id)
        const networks = state.main.networks.ethereum as Record<
          number,
          (typeof state.main.networks.ethereum)[number] | undefined
        >
        const existing = networks[chainId]
        if (existing) {
          state.activateNetwork('ethereum', chainId, true)
        } else {
          if (
            !(await ports.network.rpcMatchesChain(
              (chain as Chain & { primaryRpc?: string }).primaryRpc,
              chainId
            ))
          ) {
            throw new Error('The RPC endpoint returned a different chain ID.')
          }
          state.addNetwork(chain)
        }
        if (request) {
          located?.account.resolveRequest(request, null)
        }
      } else if (request) {
        located?.account.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
      }
      if (homeCommand) {
        state.clearHomeCommand(homeCommand.id)
      }
      return true
    },

    async replaceTransaction(command: TransactionReplaceCommand, principal: TrustedPrincipal) {
      if (locate(command.requestId)?.request.type !== 'transaction') {
        return false
      }
      ports.store.getState().navBack('panel')
      await ports.clock.delay(1_000)
      await ports.accounts.replaceTx(
        command.requestId,
        command.replacement === 'cancel' ? ReplacementType.Cancel : ReplacementType.Speed,
        principal
      )
      return true
    },

    dispose() {
      const shutdownError = { code: 4001, message: 'Request cancelled because Newframe is shutting down' }
      // Responding can mutate other continuations; finish the original shutdown set.
      const pendingContinuations = Array.from(continuations)
      for (const [requestId, continuation] of pendingContinuations) {
        const located = locate(requestId)
        if (located) {
          located.account.rejectRequest(located.request, shutdownError)
        } else if (continuation.request) {
          settle(requestId, rpcError(continuation.request as AccountRequest, shutdownError))
        } else {
          continuations.delete(requestId)
        }
      }
      approvalsInFlight.clear()
      safeContinuations.clear()
      submittedSafeTransactions.clear()
    },

    get pendingCount() {
      return continuations.size
    }
  }

  return service
}

export type RequestService = ReturnType<typeof createRequestService>
