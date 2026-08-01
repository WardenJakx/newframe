import type { TrustedPrincipal } from '../../authority.js'
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
