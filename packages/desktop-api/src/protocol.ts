import { z } from 'zod'

export const MAX_RPC_REQUEST_BYTES = 1024 * 1024

const JsonRpcIdSchema = z.union([z.string(), z.number()])
const JsonRpcParamsSchema = z.union([z.array(z.json()), z.record(z.string(), z.json())])

const requestShape = {
  id: JsonRpcIdSchema,
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: JsonRpcParamsSchema.default([])
}

const routedRequestShape = {
  ...requestShape,
  chainId: z.string().optional()
}

export const JsonRpcRequestSchema = z.strictObject(requestShape)
export const RoutedJsonRpcRequestSchema = z.strictObject(routedRequestShape)
export const HttpJsonRpcRequestSchema = z.strictObject({
  ...routedRequestShape,
  pollId: z.string().optional()
})
export const WebSocketJsonRpcRequestSchema = z.strictObject({
  ...routedRequestShape,
  __frameOrigin: z.string().optional(),
  __frameFavicon: z.json().optional(),
  __extensionConnecting: z.boolean().optional()
})

const JsonRpcErrorSchema = z.strictObject({
  code: z.number().int(),
  message: z.string(),
  data: z.json().optional()
})

const JsonRpcSuccessResponseSchema = z.strictObject({
  id: JsonRpcIdSchema,
  jsonrpc: z.literal('2.0'),
  result: z.json()
})

const JsonRpcErrorResponseSchema = z.strictObject({
  id: JsonRpcIdSchema,
  jsonrpc: z.literal('2.0'),
  error: JsonRpcErrorSchema
})

export const JsonRpcResponseSchema = z.union([JsonRpcSuccessResponseSchema, JsonRpcErrorResponseSchema])

export const EthSubscriptionNotificationSchema = z.strictObject({
  jsonrpc: z.literal('2.0'),
  method: z.literal('eth_subscription'),
  params: z.strictObject({
    subscription: z.string(),
    result: z.json()
  })
})

export const JsonRpcResponseOrNotificationSchema = z.union([
  JsonRpcResponseSchema,
  EthSubscriptionNotificationSchema
])

export function extractJsonRpcId(value: unknown): JsonRpcId | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('id' in value)) {
    return
  }

  const parsed = JsonRpcIdSchema.safeParse(value.id)
  return parsed.success ? parsed.data : undefined
}

export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>
export type HttpJsonRpcRequest = z.infer<typeof HttpJsonRpcRequestSchema>
export type WebSocketJsonRpcRequest = z.infer<typeof WebSocketJsonRpcRequestSchema>
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>
export type EthSubscriptionNotification = z.infer<typeof EthSubscriptionNotificationSchema>

// The injected provider permits omitted IDs/version fields before transport encoding.
export const CompanionPayloadSchema = z.object({
  id: JsonRpcIdSchema.optional(),
  jsonrpc: z.literal('2.0').optional(),
  method: z.string(),
  params: z.array(z.unknown()).readonly().optional(),
  chainId: z.string().optional(),
  __frameOrigin: z.string().optional(),
  __frameFavicon: z.string().optional(),
  __extensionConnecting: z.boolean().optional()
})
export const SubscriptionParamsSchema = z.object({ subscription: z.string(), result: z.unknown() })
export const CompanionResponseSchema = z
  .object({
    id: JsonRpcIdSchema.optional(),
    jsonrpc: z.literal('2.0').optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
    method: z.string().optional(),
    params: z.union([z.array(z.unknown()).readonly(), SubscriptionParamsSchema]).optional()
  })
  .refine(
    (value) =>
      value.id !== undefined ||
      (typeof value.method === 'string' && SubscriptionParamsSchema.safeParse(value.params).success)
  )
export type CompanionPayload = z.infer<typeof CompanionPayloadSchema>
export type CompanionResponse = z.infer<typeof CompanionResponseSchema>
export type SubscriptionParams = z.infer<typeof SubscriptionParamsSchema>
