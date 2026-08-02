import type { TrustedPrincipal } from '../../authority.js'
import type { AccountRequest, SignTypedDataRequest, TransactionRequest } from '../../../contracts/requests.js'
import type { SideTrayTransactionPorts } from '../../features/transactions/sideTrayService.js'
import type { Provider } from '../../provider/index.js'
import { createOneResultCallbackBoundary } from '../callbacks/oneResult.js'

export function createProviderRequestAdapter(
  provider: Pick<Provider, 'send'>
): SideTrayTransactionPorts['provider'] & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: callbacks.dispose,
    request(payload: RPCRequestPayload, principal: TrustedPrincipal) {
      return callbacks.run<RPCResponsePayload>((done) =>
        provider.send(payload, (response) => done(null, response), principal)
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
    approve: (request: TRequest, done: Callback<string>) => void
  ) => callbacks.run<string>((done) => approve(request, done))

  return {
    dispose: callbacks.dispose,
    approveSign: (request: AccountRequest) => run(request, provider.approveSign.bind(provider)),
    approveSignTypedData: (request: SignTypedDataRequest) =>
      run(request, provider.approveSignTypedData.bind(provider)),
    approveTransactionRequest: (request: TransactionRequest) =>
      run(request, provider.approveTransactionRequest.bind(provider))
  }
}
