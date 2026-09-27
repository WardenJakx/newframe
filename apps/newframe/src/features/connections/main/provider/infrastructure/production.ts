import type { RequestSource } from '../../../../../app/main/gateway/requestSource.js'
import type { RpcIpcHandlers } from '../../../../../app/main/ipc-handlers/rpc.js'
import type { ProtectedOperationsService } from '../../../../../app/main/protected-operations/service.js'
import { createOneResultCallbackBoundary } from '../../../../../platform/callbacks/oneResult.js'
import type { SigningUiContext } from '../../../../../platform/signing/signers/Signer/index.js'
import type {
  AccountRequest,
  SignTypedDataRequest,
  TransactionRequest
} from '../../../../requests/contract/requests.js'
import type { SideTrayTransactionPorts } from '../../../../transactions/main/sideTrayService.js'

export function createNamedAccountTransactionAdapter(
  provider: Pick<RpcIpcHandlers, 'prepareAccountTransaction'> &
    Pick<ProtectedOperationsService, 'executeAccountTransaction'>
) {
  return {
    prepare: provider.prepareAccountTransaction.bind(provider),
    execute: provider.executeAccountTransaction.bind(provider)
  }
}

export function createProviderRequestAdapter(
  provider: Pick<RpcIpcHandlers, 'send'>
): SideTrayTransactionPorts['provider'] & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: () => callbacks.dispose(),
    request(payload: RPCRequestPayload, principal: RequestSource, context) {
      return callbacks.run<RPCResponsePayload>((done) => {
        Promise.resolve(provider.send(payload, (response) => done(null, response), principal, context)).catch(
          done
        )
      })
    }
  }
}

export function createRequestApprovalAdapter(
  provider: Pick<
    ProtectedOperationsService,
    'approveSign' | 'approveSignTypedData' | 'approveTransactionRequest'
  >
) {
  const callbacks = createOneResultCallbackBoundary()
  const run = <TRequest extends AccountRequest>(
    request: TRequest,
    approve: (request: TRequest, done: Callback<string>, context?: SigningUiContext) => void,
    context?: SigningUiContext
  ) => callbacks.run<string>((done) => approve(request, done, context))

  return {
    dispose: () => callbacks.dispose(),
    approveSign: (request: AccountRequest, context?: SigningUiContext) =>
      run(request, provider.approveSign.bind(provider), context),
    approveSignTypedData: (request: SignTypedDataRequest, context?: SigningUiContext) =>
      run(request, provider.approveSignTypedData.bind(provider), context),
    approveTransactionRequest: (request: TransactionRequest, context?: SigningUiContext) =>
      run(request, provider.approveTransactionRequest.bind(provider), context)
  }
}
