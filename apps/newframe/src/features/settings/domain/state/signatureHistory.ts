import { z } from 'zod'

import type { SignatureRequest } from '../../../requests/contract/requests.js'

export const SIGNATURE_HISTORY_LIMIT = 100
const CONTENT_LIMIT = 65_536
const SIGNATURE_LIMIT = 16_384

export const SignatureHistoryItemSchema = z.strictObject({
  id: z.string().min(1),
  accountId: z.string().min(1),
  origin: z.string().max(256),
  kind: z.enum(['message', 'typed-data', 'sign-in', 'authorization']),
  signedAt: z.string(),
  summary: z.string().max(160),
  message: z.string().max(CONTENT_LIMIT),
  signature: z.string().max(SIGNATURE_LIMIT),
  network: z.string().max(128).optional()
})

export const SignatureHistorySchema = z
  .array(SignatureHistoryItemSchema)
  .max(SIGNATURE_HISTORY_LIMIT)
  .default([])
export type SignatureHistoryItem = z.infer<typeof SignatureHistoryItemSchema>

function bounded(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

export function signatureHistoryItem(
  request: SignatureRequest,
  signature: string,
  context: { origin: string; network?: string; signedAt: string }
): SignatureHistoryItem {
  const typed = request.type !== 'sign'
  const message = typed ? JSON.stringify(request.typedMessage.data, null, 2) : request.data.decodedMessage
  const isSignIn = !typed && message.includes('wants you to sign in with your Ethereum account')
  const primaryType =
    typed && !Array.isArray(request.typedMessage.data) ? request.typedMessage.data.primaryType : undefined
  let summary: string
  let kind: SignatureHistoryItem['kind']
  if (isSignIn) {
    summary = 'Sign in with Ethereum'
    kind = 'sign-in'
  } else if (typed) {
    summary = String(primaryType ?? 'Typed data')
    kind = 'typed-data'
  } else {
    summary =
      message
        .split('\n')
        .find((line) => line.trim())
        ?.trim() ?? 'Signed message'
    kind = 'message'
  }

  return {
    id: request.handlerId,
    accountId: request.account.toLowerCase(),
    origin: bounded(context.origin, 256),
    kind,
    signedAt: context.signedAt,
    summary: bounded(summary, 160),
    message: bounded(message, CONTENT_LIMIT),
    signature: bounded(signature, SIGNATURE_LIMIT),
    ...(context.network ? { network: bounded(context.network, 128) } : {})
  }
}
