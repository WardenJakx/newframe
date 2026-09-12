import type { SigningUiContext } from '../../../../../platform/signing/signers/Signer/index.js'
import type { TrustedPrincipal } from '../../../../access-control/main/authority.js'
import type {
  AccountRequest,
  SignTypedDataRequest,
  TransactionRequest
} from '../../../../requests/contract/requests.js'
import type { SideTrayTransactionPorts } from '../../../../transactions/main/sideTrayService.js'
import type { Provider } from '../index.js'
import { createOneResultCallbackBoundary } from '../../../../../platform/callbacks/oneResult.js'

export function createProviderRequestAdapter(
  provider: Pick<Provider, 'send'>
): SideTrayTransactionPorts['provider'] & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: callbacks.dispose,
    request(payload: RPCRequestPayload, principal: TrustedPrincipal, context) {
      return callbacks.run<RPCResponsePayload>((done) =>
        provider.send(payload, (response) => done(null, response), principal, context)
      )
    }
  }
}

export function createRequestApprovalAdapter(
  provider: Pick<Provider, 'approveSign' | 'approveSignTypedData' | 'approveTransactionRequest'>
) {
  const callbacks = createOneResultCallbackBoundary()
  const run = <TRequest extends AccountRequest>(
    request: TRequest,
    approve: (request: TRequest, done: Callback<string>, context?: SigningUiContext) => void,
    context?: SigningUiContext
  ) => callbacks.run<string>((done) => approve(request, done, context))

  return {
    dispose: callbacks.dispose,
    approveSign: (request: AccountRequest, context?: SigningUiContext) =>
      run(request, provider.approveSign.bind(provider), context),
    approveSignTypedData: (request: SignTypedDataRequest, context?: SigningUiContext) =>
      run(request, provider.approveSignTypedData.bind(provider), context),
    approveTransactionRequest: (request: TransactionRequest, context?: SigningUiContext) =>
      run(request, provider.approveTransactionRequest.bind(provider), context)
  }
}
