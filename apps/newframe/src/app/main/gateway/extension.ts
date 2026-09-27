import { dispatchGatewayOperation } from './dispatch.js'
import { isRequestSource, hasSourceCapability, type LocalApiSource } from './requestSource.js'
import { rpcMethodPolicy } from './rpcPolicy.js'

export function createExtensionGateway(windows: { toggleTray(): unknown }) {
  return async ({
    payload,
    chainId,
    source,
    respond
  }: {
    payload: RPCRequestPayload
    chainId: string
    source: LocalApiSource
    respond(this: void, response: RPCResponsePayload): void
  }): Promise<boolean> => {
    const policy = rpcMethodPolicy(payload.method)
    if (
      !policy ||
      (policy.route !== 'extension' && !['eth_chainId', 'net_version'].includes(payload.method))
    ) {
      return false
    }
    // Website chain queries use the ordinary RPC gateway with their website source.
    if (
      source.participant !== 'companion-extension' &&
      ['eth_chainId', 'net_version'].includes(payload.method)
    ) {
      return false
    }
    const result = await dispatchGatewayOperation(
      {
        parse: () =>
          policy.params.safeParse(payload.params).success
            ? { success: true as const, data: payload }
            : { success: false as const },
        authorize: (input: RPCRequestPayload, admitted: LocalApiSource) =>
          isRequestSource(admitted) &&
          admitted.participant === 'companion-extension' &&
          (!input.method.startsWith('frame_') || hasSourceCapability(admitted, 'wallet:internal-state')),
        handle(input: RPCRequestPayload) {
          if (input.method === 'frame_summon') {
            windows.toggleTray()
            return null
          }
          return input.method === 'net_version' ? parseInt(chainId, 16) : chainId
        }
      },
      payload,
      source
    )
    respond(
      result.ok
        ? { id: payload.id, jsonrpc: payload.jsonrpc, result: result.value }
        : {
            id: payload.id,
            jsonrpc: payload.jsonrpc,
            error:
              result.error === 'invalid_request'
                ? { code: -32602, message: 'Invalid method parameters' }
                : { code: 4001, message: 'Extension-owned operation required' }
          }
    )
    return true
  }
}
