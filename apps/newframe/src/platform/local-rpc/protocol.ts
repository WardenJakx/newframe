import { z } from 'zod'

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
