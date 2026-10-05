import { z } from 'zod'

export const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/i)
export const HexSchema = z.string().regex(/^0x[0-9a-f]*$/i)
export const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/i)
export const AiSessionDescriptorSchema = z.strictObject({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).optional(),
  url: z
    .url({ protocol: /^https?:$/ })
    .max(2048)
    .optional()
})
export const AiSessionConnectSchema = z.strictObject({
  descriptor: AiSessionDescriptorSchema,
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(180 * 24 * 60 * 60)
})
export const SessionSchema = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  account: AddressSchema,
  expiresAt: z.number()
})
export const AiSessionCredentialsSchema = SessionSchema.extend({ descriptor: AiSessionDescriptorSchema })
export const RoutingSchema = z.object({
  chainId: z.string().optional(),
  origin: z.string().optional(),
  connecting: z.boolean().optional()
})
export const RpcCallSchema = RoutingSchema.extend({
  method: z.string().min(1).max(128),
  params: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).default([])
})
export const OriginStatusSchema = z.object({
  originId: z.string(),
  origin: z.string(),
  connected: z.boolean(),
  address: z.string(),
  selectedAddress: z.string().optional(),
  chainId: z.string().optional()
})
export const ExtensionAccountsSchema = z.object({
  accounts: z.array(z.object({ address: AddressSchema, name: z.string() })),
  selected: z.union([AddressSchema, z.literal('')]),
  /** Present when every account in the current profile is shared with the extension. */
  all: z.literal(true).optional()
})
export const ChainSchema = z.looseObject({
  chainId: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  connected: z.boolean().optional(),
  icon: z.array(z.looseObject({ url: z.string() })).optional()
})
export const ProviderEventSchema = z.enum([
  'networkChanged',
  'chainChanged',
  'chainsChanged',
  'accountsChanged',
  'assetsChanged'
])
export const WalletEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('chainsChanged'), value: z.array(ChainSchema) }),
  z.object({ event: z.literal('accountsChanged'), value: z.array(z.string()) }),
  z.object({ event: z.literal('chainChanged'), value: z.string() }),
  z.object({ event: z.literal('networkChanged'), value: z.union([z.string(), z.number()]) }),
  z.object({ event: z.literal('assetsChanged'), value: z.unknown() })
])
export const RpcErrorSchema = z.object({
  code: z.number().optional(),
  message: z.string(),
  data: z.unknown().optional()
})
export type RpcCall = z.infer<typeof RpcCallSchema>
export type AiSessionDescriptor = z.infer<typeof AiSessionDescriptorSchema>
export type AiSessionConnect = z.infer<typeof AiSessionConnectSchema>
export type AiSessionCredentials = z.infer<typeof AiSessionCredentialsSchema>
export type Session = z.infer<typeof SessionSchema>
export type AvailableChain = z.infer<typeof ChainSchema>
export type OriginStatus = z.infer<typeof OriginStatusSchema>
export type ExtensionAccounts = z.infer<typeof ExtensionAccountsSchema>
export type WalletEvent = z.infer<typeof WalletEventSchema>
export type ProviderEvent = z.infer<typeof ProviderEventSchema>

export type RpcError = z.infer<typeof RpcErrorSchema>
