import { randomUUID } from 'node:crypto'

import type {
  AccountRequest,
  AccessRequest,
  AddChainRequest,
  AddTokenRequest,
  RequestApprovalGate,
  SignTypedDataRequest,
  TransactionRequest
} from '../contract/requests.js'
import { ReplacementType } from '../contract/requests.js'
import type {
  NetworkRequestResolveCommand,
  TransactionReplaceCommand
} from '../../../app/contracts/operations.js'
import { ApprovalType } from '../domain/approval.js'
import { isSignatureRequest, isTransactionRequest, isTypedMessageSignatureRequest } from '../domain/index.js'
import { resolveAssetRate } from '../../asset-data/domain/asset/index.js'
import {
  findUnavailableSigners,
  isHardwareSigner,
  isSignerReady
} from '../../../platform/signing/domain/index.js'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants.js'
import { usesBaseFee } from '../../transactions/domain/index.js'
import { toBigInt } from '../../../shared/domain/units.js'
import type { TrustedPrincipal } from '../../access-control/main/authority.js'
import type { Accounts } from '../../accounts/main/index.js'
import type { AccountTransactionPolicyPort } from '../../transactions/main/accountPolicyPort.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { Chain } from '../../../platform/state-store/state/index.js'

const FEE_WARNING_THRESHOLD_USD = 50

type Continuation = {
  respond: RPCRequestCallback
  request?: Pick<AccountRequest, 'account' | 'handlerId' | 'payload'>
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
  >
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
    approveSign(request: AccountRequest): Promise<string>
    approveSignTypedData(request: SignTypedDataRequest): Promise<string>
    approveTransactionRequest(request: TransactionRequest): Promise<string>
  }
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
  const approvalsInFlight = new Set<string>()

  const locate = <T extends AccountRequest = AccountRequest>(requestId: string) => {
    const accountState = Object.values(ports.store.getState().main.accounts).find(
      (account) => account.requests?.[requestId]
    )
    if (!accountState) return
    const account = ports.accounts.getFrameAccount(accountState.id)
    const request = account?.getRequest<T>(requestId)
    return account && request ? { account, request } : undefined
  }

  const setGate = (account: RequestAccount, requestId: string, gate?: RequestApprovalGate) => {
    account.patchRequest(requestId, (request) => {
      if (gate) request.approvalGate = gate
      else delete request.approvalGate
    })
  }

  const settle = (requestId: string, response: RPCResponsePayload) => {
    const continuation = continuations.get(requestId)
    if (!continuation) return false
    continuations.delete(requestId)
    continuation.respond(response)
    return true
  }

  const failApproval = (request: AccountRequest, error: unknown) => {
    approvalsInFlight.delete(request.handlerId)
    if (!settle(request.handlerId, rpcError(request, normalizedError(error)))) return
    ports.accounts.setRequestError(
      request.handlerId,
      error instanceof Error ? error : new Error(String(error))
    )
  }

  const completeApproval = (request: AccountRequest, result: unknown) => {
    approvalsInFlight.delete(request.handlerId)
    if (!settle(request.handlerId, rpcSuccess(request, result))) return
    if (isTransactionRequest(request)) ports.accounts.setTxSent(request.handlerId, result as string)
    else ports.accounts.setRequestSuccess(request.handlerId)
  }

  const signerGate = (
    account: RequestAccount,
    request: AccountRequest,
    confirmed: ReadonlySet<RequestApprovalGate['type']>
  ): RequestApprovalGate | undefined => {
    const signerSummaries = ports.store.getState().main.signers || {}
    const signer = account.signer ? signerSummaries[account.signer] : undefined
    if (!signer) {
      const unavailable = findUnavailableSigners(
        account.lastSignerType,
        Object.values(signerSummaries) as Signer[]
      )
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

    if (!isTransactionRequest(request)) return
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
    const state = ports.store.getState().main
    if (state.mute.gasFeeWarning || confirmed.has('gas-fee')) return

    const chainId = parseInt(request.data.chainId, 16)
    const network = state.networks.ethereum[chainId]
    const nativeCurrency = state.networksMeta.ethereum[chainId]?.nativeCurrency
    const currentSymbol = nativeCurrency?.symbol || '?'
    const nativeUSD = !network?.isTestnet
      ? resolveAssetRate(
          { chainId, address: NATIVE_CURRENCY, nativeTicker: nativeCurrency?.symbol },
          state.assetRates
        )?.usdRate
      : undefined
    if (typeof nativeUSD !== 'number') return

    const gasLimit = toBigInt(request.data.gasLimit) ?? 0n
    const maxFeePerGas =
      toBigInt(usesBaseFee(request.data) ? request.data.maxFeePerGas : request.data.gasPrice) ?? 0n
    const feeUSD = displayUSD((Number(maxFeePerGas * gasLimit) / 1e18) * nativeUSD)
    if (Number(feeUSD) <= FEE_WARNING_THRESHOLD_USD && feeUSD !== '0.00') return

    return { type: 'gas-fee', feeUSD, currentSymbol }
  }

  const executeApproval = (account: RequestAccount, request: AccountRequest) => {
    if (approvalsInFlight.has(request.handlerId)) return true
    approvalsInFlight.add(request.handlerId)
    setGate(account, request.handlerId)
    ports.accounts.setRequestPending(request)

    const approval = isTransactionRequest(request)
      ? ports.provider.approveTransactionRequest(request)
      : request.type === 'sign'
        ? ports.provider.approveSign(request)
        : isTypedMessageSignatureRequest(request)
          ? ports.provider.approveSignTypedData(request)
          : undefined
    void approval?.then(
      (result) => completeApproval(request, result),
      (error) => failApproval(request, error)
    )
    return true
  }

  const advanceApproval = (
    account: RequestAccount,
    request: AccountRequest,
    confirmed: ReadonlySet<RequestApprovalGate['type']>
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
    return executeApproval(account, request)
  }

  const service = {
    bind(request: AccountRequest) {
      const continuation = continuations.get(request.handlerId)
      if (continuation) continuation.request = request
    },

    cancel(requestId: string) {
      return continuations.delete(requestId)
    },

    create(respond: RPCRequestCallback, requestId: string = randomUUID()) {
      if (continuations.has(requestId)) throw new Error(`Request continuation already exists: ${requestId}`)
      continuations.set(requestId, { respond })
      return requestId
    },

    respond: settle,

    resolve(request: AccountRequest, result?: unknown) {
      return settle(request.handlerId, rpcSuccess(request, result))
    },

    reject(request: AccountRequest, error: EVMError) {
      approvalsInFlight.delete(request.handlerId)
      return settle(request.handlerId, rpcError(request, error))
    },

    approve(requestId: string) {
      const located = locate(requestId)
      if (!located || (!isTransactionRequest(located.request) && !isSignatureRequest(located.request))) {
        return false
      }
      if (located.request.authorization?.decision !== 'prompt') return false
      if (approvalsInFlight.has(requestId)) return true
      // Canonical success/error UI can outlive the external requester briefly.
      // Once its continuation is settled, approving the same request again must
      // acknowledge without repeating signing or broadcast side effects.
      if (!continuations.has(requestId)) return true

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
      return advanceApproval(located.account, located.request, new Set())
    },

    confirmWarning(requestId: string, gate: RequestApprovalGate['type']) {
      const located = locate(requestId)
      const pendingGate = located?.request.approvalGate
      if (!located || !pendingGate || pendingGate.type !== gate) return false
      if (pendingGate.type === 'signer-compatibility' && pendingGate.reason !== 'incompatible') {
        return false
      }
      setGate(located.account, requestId)
      return advanceApproval(
        located.account,
        located.request,
        gate === 'gas-fee' ? new Set(['signer-compatibility', 'gas-fee']) : new Set([gate])
      )
    },

    rejectRequest(requestId: string) {
      const located = locate(requestId)
      if (!located) return false
      located.account.rejectRequest(located.request, {
        code: 4001,
        message: 'User rejected the request'
      })
      return true
    },

    resolveAccess(requestId: string, approved: boolean) {
      const located = locate<AccessRequest>(requestId)
      if (located?.request.type !== 'access') return false
      located.account.setAccess(located.request, approved)
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
      if (!located || !request || request.type !== 'switchChain') return false
      if (approved) {
        const state = ports.store.getState()
        const chainId = Number(request.chain?.id)
        if (
          request.chain?.type !== 'ethereum' ||
          !Number.isInteger(chainId) ||
          !state.main.origins[request.origin] ||
          !state.main.networks.ethereum[chainId]
        ) {
          return false
        }
        state.switchOriginChain(request.origin, chainId, 'ethereum')
      }
      located.account.resolveRequest(request)
      return true
    },

    clearOrigin(accountId: string, originId: string) {
      if (!ports.accounts.get(accountId)) return false
      ports.accounts.clearRequestsByOrigin(accountId, originId)
      return true
    },

    confirmRequestApproval(requestId: string, approvalType: 'approveOtherChain' | 'approveGasLimit') {
      const located = locate<TransactionRequest>(requestId)
      if (located?.request.type !== 'transaction') return false
      const approval = located.request.approvals?.find((candidate) => candidate.type === approvalType)
      if (!approval || approval.approved) return false
      return located.account.approveRequest(requestId, approvalType as ApprovalType, {})
    },

    reviewAddChain(requestId: string) {
      const located = locate<AddChainRequest>(requestId)
      if (located?.request.type !== 'addChain') return false
      ports.store.getState().navHome({
        view: 'addChain',
        data: { chain: located.request.chain, requestId: located.request.handlerId }
      })
      return true
    },

    reviewAddToken(requestId: string) {
      const located = locate<AddTokenRequest>(requestId)
      if (located?.request.type !== 'addToken') return false
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
      const chain = request?.chain || homeCommand?.data?.newChain || homeCommand?.data?.chain
      if (!chain) return false

      if (command.approved) {
        const chainId = Number(chain.id)
        const existing = state.main.networks.ethereum[chainId]
        if (existing) state.activateNetwork('ethereum', chainId, true)
        else {
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
        if (request) located?.account.resolveRequest(request, null)
      } else if (request) {
        located?.account.rejectRequest(request, { code: 4001, message: 'User rejected the request' })
      }
      if (homeCommand) state.clearHomeCommand(homeCommand.id)
      return true
    },

    async replaceTransaction(command: TransactionReplaceCommand, principal: TrustedPrincipal) {
      if (locate(command.requestId)?.request.type !== 'transaction') return false
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
      for (const [requestId, continuation] of [...continuations]) {
        const located = locate(requestId)
        if (located) located.account.rejectRequest(located.request, shutdownError)
        else if (continuation.request)
          settle(requestId, rpcError(continuation.request as AccountRequest, shutdownError))
        else continuations.delete(requestId)
      }
      approvalsInFlight.clear()
    },

    get pendingCount() {
      return continuations.size
    }
  }

  return service
}

export type RequestService = ReturnType<typeof createRequestService>
