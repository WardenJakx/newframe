import { z } from 'zod'

import type { OriginsService } from '../../../features/connections/main/origins.js'
import { mapRequest } from '../../../features/connections/main/requests/index.js'
import { dispatchGatewayOperation } from './dispatch.js'
import { isAiSessionActive, isRequestSource, type RequestSource } from './requestSource.js'
import { rpcMethodPolicy } from './rpcPolicy.js'

const RpcOperationSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1).max(128),
  params: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  _origin: z.string(),
  chainId: z.string().optional()
})

export interface RpcGatewayPorts {
  origins?: Pick<OriginsService, 'hasAccountAccessGrant'>
  selectedAddresses(): string[]
  handle(
    payload: RPCRequestPayload,
    respond: RPCRequestCallback,
    source?: RequestSource
  ): void | Promise<void>
}

/** Shared by local API clients, AI-session clients, renderer compositions and main-process callers. */
export function createRpcGateway(ports: RpcGatewayPorts) {
  return async (input: RPCRequestPayload, respond: RPCRequestCallback, source?: RequestSource) => {
    let settled = false
    const reply: RPCRequestCallback = (response) => {
      if (!settled) {
        settled = true
        respond(response)
      }
    }
    let effectiveMethod = input.method
    let invalid = { code: -32600, message: 'Invalid gateway request' }
    const result = await dispatchGatewayOperation(
      {
        parse(value: unknown): { success: true; data: RPCRequestPayload } | { success: false } {
          const envelope = RpcOperationSchema.safeParse(value)
          if (!envelope.success) {
            return { success: false as const }
          }
          let payload = envelope.data as RPCRequestPayload
          let policy = rpcMethodPolicy(payload.method)
          if (policy?.route === 'envelope') {
            try {
              payload = mapRequest(payload)
            } catch {
              invalid = { code: -32602, message: 'Invalid wrapper parameters' }
              return { success: false as const }
            }
            policy = rpcMethodPolicy(payload.method)
          }
          if (!policy || ['envelope', 'extension', 'transport'].includes(policy.route)) {
            invalid = { code: -32601, message: 'Method not found' }
            return { success: false as const }
          }
          effectiveMethod = payload.method
          const params = policy.params.safeParse(payload.params)
          if (!params.success) {
            invalid = { code: -32602, message: 'Invalid method parameters' }
            return { success: false as const }
          }
          return { success: true as const, data: payload }
        },
        async authorize(payload, context: { source?: RequestSource }) {
          const source = context.source
          if (source && !isRequestSource(source)) {
            return false
          }
          if (source?.kind === 'agent') {
            return isAiSessionActive(source) && rpcMethodPolicy(payload.method)?.aiSession === true
          }
          const policy = rpcMethodPolicy(payload.method)
          if (!policy) {
            return false
          }
          if (policy.permission === 'public') {
            return true
          }
          if (policy.permission === 'internal') {
            return source?.kind === 'main'
          }
          if (!source) {
            return false
          }
          if (policy.permission === 'account' && source.kind === 'rpc') {
            return (await ports.origins?.hasAccountAccessGrant(payload, source)) ?? false
          }
          return true
        },
        handle: (payload, context) => ports.handle(payload, reply, context.source)
      },
      input,
      { source }
    )
    if (result.ok) {
      return
    }
    if (result.error === 'unauthorized' && effectiveMethod === 'eth_accounts') {
      reply({ id: input.id, jsonrpc: input.jsonrpc, result: [] })
      return
    }
    let code = -32603
    let message = 'Internal error'
    if (result.error === 'invalid_request') {
      code = invalid.code
      message = invalid.message
    } else if (result.error === 'unauthorized') {
      code = source ? 4001 : 4100
      message = 'Wallet action is missing a trusted request source'
      if (source) {
        message = ports.selectedAddresses()[0]
          ? 'Permission denied for this request source'
          : 'No Newframe account selected'
      }
    }
    reply({ id: input.id, jsonrpc: input.jsonrpc, error: { code, message } })
  }
}
