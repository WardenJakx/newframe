import { JsonRpcIdSchema, type JsonRpcId } from '@newframe/schema/json-rpc'

export function extractJsonRpcId(value: unknown): JsonRpcId | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('id' in value)) {
    return
  }

  const parsed = JsonRpcIdSchema.safeParse(value.id)
  return parsed.success ? parsed.data : undefined
}
